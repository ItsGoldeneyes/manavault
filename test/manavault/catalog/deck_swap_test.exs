defmodule Manavault.Catalog.DeckSwapTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog
  alias Manavault.Catalog.{DeckAllocation, DeckCard}
  alias Manavault.Repo

  setup do
    assert {:ok, _result} =
             Catalog.import_cards([
               legal_commander_card(),
               legal_plains(),
               legality_card("Silver Bolt", ["W"], %{"commander" => "legal"}),
               legality_card("White Ward", ["W"], %{"commander" => "legal"}),
               legality_card("Dawn Charm", ["W"], %{"commander" => "legal"}),
               legality_card("Red Bolt", ["R"], %{"commander" => "legal"})
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Swap Target", "format" => "commander"})

    commander = add_deck_card!(deck, "Test Commander", 1, "commander")
    plains = add_deck_card!(deck, "Plains", 98, "mainboard")
    silver_bolt = add_deck_card!(deck, "Silver Bolt", 1, "mainboard")
    white_ward = add_deck_card!(deck, "White Ward", 1, "considering")
    red_bolt = add_deck_card!(deck, "Red Bolt", 1, "considering")

    %{
      commander: commander,
      deck: deck,
      plains: plains,
      red_bolt: red_bolt,
      silver_bolt: silver_bolt,
      white_ward: white_ward
    }
  end

  describe "preview_deck_swap/2" do
    test "evaluates legality of the swapped list without writing", ctx do
      assert %{status: "legal"} = Catalog.deck_legality(Catalog.get_deck!(ctx.deck.id))

      swap = %{
        cuts: [%{deck_card_id: ctx.silver_bolt.id, quantity: 1, destination: :remove}],
        adds: [%{deck_card_id: ctx.red_bolt.id, quantity: 1}]
      }

      assert {:ok, preview} = Catalog.preview_deck_swap(Catalog.get_deck!(ctx.deck.id), swap)
      assert preview.card_count == 100
      assert preview.unresolved_names == []
      assert preview.legality.status == "illegal"
      assert issue_by_code(preview.legality, "commander_color_identity").card_name == "Red Bolt"

      assert Repo.get!(DeckCard, ctx.silver_bolt.id).zone == "mainboard"
      assert Repo.get!(DeckCard, ctx.red_bolt.id).zone == "considering"
    end

    test "counts cuts and adds by name and reports unknown names", ctx do
      swap = %{
        cuts: [%{deck_card_id: ctx.plains.id, quantity: 2, destination: :remove}],
        adds: [
          %{name: "Dawn Charm", quantity: 1},
          %{name: "No Such Card", quantity: 1}
        ]
      }

      assert {:ok, preview} = Catalog.preview_deck_swap(Catalog.get_deck!(ctx.deck.id), swap)
      assert preview.card_count == 99
      assert preview.unresolved_names == ["No Such Card"]

      assert %{code: "commander_deck_size"} =
               issue_by_code(preview.legality, "commander_deck_size")
    end

    test "rejects invalid swaps", ctx do
      deck = Catalog.get_deck!(ctx.deck.id)

      assert {:error, :empty_swap} = Catalog.preview_deck_swap(deck, %{cuts: [], adds: []})

      assert {:error, :swap_cut_not_in_deck} =
               Catalog.preview_deck_swap(deck, %{
                 cuts: [%{deck_card_id: ctx.white_ward.id, quantity: 1}],
                 adds: []
               })

      assert {:error, :swap_add_not_considering} =
               Catalog.preview_deck_swap(deck, %{
                 cuts: [],
                 adds: [%{deck_card_id: ctx.silver_bolt.id, quantity: 1}]
               })

      assert {:error, :swap_quantity_exceeds_deck_card} =
               Catalog.preview_deck_swap(deck, %{
                 cuts: [%{deck_card_id: ctx.silver_bolt.id, quantity: 2}],
                 adds: []
               })

      assert {:error, :duplicate_swap_entry} =
               Catalog.preview_deck_swap(deck, %{
                 cuts: [
                   %{deck_card_id: ctx.silver_bolt.id, quantity: 1},
                   %{deck_card_id: ctx.silver_bolt.id, quantity: 1}
                 ],
                 adds: []
               })
    end
  end

  describe "apply_deck_swap/2" do
    test "commits cuts to Considering, removals, and adds together", ctx do
      assert {:ok, _count} =
               Catalog.update_deck_card(ctx.silver_bolt, %{"tag" => "consider_cutting"})

      swap = %{
        cuts: [
          %{deck_card_id: ctx.silver_bolt.id, quantity: 1, destination: :considering},
          %{deck_card_id: ctx.plains.id, quantity: 1, destination: :remove}
        ],
        adds: [
          %{deck_card_id: ctx.white_ward.id, quantity: 1},
          %{name: "Dawn Charm", quantity: 1}
        ]
      }

      assert {:ok, deck} = Catalog.apply_deck_swap(ctx.deck, swap)

      silver_bolt = Repo.get!(DeckCard, ctx.silver_bolt.id)
      assert silver_bolt.zone == "considering"
      assert silver_bolt.tag == nil
      assert Repo.get!(DeckCard, ctx.plains.id).quantity == 97
      assert Repo.get!(DeckCard, ctx.white_ward.id).zone == "mainboard"

      assert %{status: "legal"} =
               deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

      assert deck.id |> Catalog.get_deck!() |> Catalog.deck_card_count() == 100
    end

    test "rolls back every change when one step fails", ctx do
      swap = %{
        cuts: [%{deck_card_id: ctx.silver_bolt.id, quantity: 1, destination: :remove}],
        adds: [%{name: "No Such Card", quantity: 1}]
      }

      assert {:error, :card_not_found} = Catalog.apply_deck_swap(ctx.deck, swap)
      assert Repo.get!(DeckCard, ctx.silver_bolt.id).zone == "mainboard"
    end

    test "merges into existing rows when the target zone already has the card", ctx do
      add_deck_card!(ctx.deck, "Plains", 2, "considering")

      swap = %{
        cuts: [%{deck_card_id: ctx.plains.id, quantity: 3, destination: :considering}],
        adds: []
      }

      assert {:ok, _deck} = Catalog.apply_deck_swap(ctx.deck, swap)

      plains_rows =
        Repo.all(
          from deck_card in DeckCard,
            where: deck_card.deck_id == ^ctx.deck.id and deck_card.oracle_id == "oracle-plains"
        )

      assert plains_rows |> Enum.map(&{&1.zone, &1.quantity}) |> Enum.sort() ==
               [{"considering", 5}, {"mainboard", 95}]
    end

    test "partial cuts release copies beyond the remaining quantity", ctx do
      dawn_charm = add_deck_card!(ctx.deck, "Dawn Charm", 4, "mainboard")

      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-dawn-charm",
                 "quantity" => 4,
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil"
               })

      assert {:ok, _deck_card} =
               Catalog.allocate_collection_item_to_deck_card(dawn_charm.id, item.id, 4)

      swap = %{
        cuts: [%{deck_card_id: dawn_charm.id, quantity: 3, destination: :remove}],
        adds: []
      }

      assert {:ok, _deck} = Catalog.apply_deck_swap(ctx.deck, swap)
      assert Repo.get!(DeckCard, dawn_charm.id).quantity == 1

      allocated =
        Repo.one(
          from allocation in DeckAllocation,
            where: allocation.deck_card_id == ^dawn_charm.id,
            select: sum(allocation.quantity)
        )

      assert allocated == 1

      assert Catalog.deck_card_allocation_status(Repo.get!(DeckCard, dawn_charm.id)).available ==
               3
    end

    test "refuses archived decks", ctx do
      assert {:ok, archived} = Catalog.update_deck(ctx.deck, %{"status" => "archived"})

      assert {:error, :deck_archived} =
               Catalog.apply_deck_swap(archived, %{
                 cuts: [%{deck_card_id: ctx.silver_bolt.id, quantity: 1}],
                 adds: []
               })
    end
  end
end
