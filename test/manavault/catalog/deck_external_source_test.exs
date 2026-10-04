defmodule Manavault.Catalog.DeckExternalSourceTest do
  use Manavault.DataCase, async: false
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :black_lotus_beta, :time_walk]

  alias Manavault.Catalog
  alias Manavault.Catalog.{DeckAllocation, DeckCard}
  alias Manavault.Catalog.Decks.ExternalSource

  @stub __MODULE__.Stub
  @url "https://archidekt.com/decks/123456/my-deck"

  setup do
    previous = Application.get_env(:manavault, :trade_archidekt_req_options)

    Application.put_env(:manavault, :trade_archidekt_req_options,
      plug: {Req.Test, @stub},
      retry: false
    )

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :trade_archidekt_req_options, previous)
      else
        Application.delete_env(:manavault, :trade_archidekt_req_options)
      end
    end)

    assert {:ok, _result} = Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])
    :ok
  end

  describe "parse_url/1" do
    test "canonicalizes Moxfield and Archidekt deck links" do
      assert {:ok,
              %{
                external_source: "moxfield",
                external_id: "mAAm0BWxF0OZ0TTF3FsHqg",
                external_url: "https://moxfield.com/decks/mAAm0BWxF0OZ0TTF3FsHqg"
              }} =
               ExternalSource.parse_url(
                 "https://www.moxfield.com/decks/mAAm0BWxF0OZ0TTF3FsHqg?x=1"
               )

      assert {:ok, %{external_source: "archidekt", external_id: "123456"}} =
               ExternalSource.parse_url(" #{@url} ")
    end

    test "rejects other links" do
      assert {:error, :invalid_external_url} = ExternalSource.parse_url("https://tappedout.net/x")

      assert {:error, :invalid_external_url} =
               ExternalSource.parse_url("https://moxfield.com/u/me")

      assert {:error, :invalid_external_url} = ExternalSource.parse_url("not a url")
      assert {:error, :invalid_external_url} = ExternalSource.parse_url(nil)
    end
  end

  describe "link/2 and sync/1" do
    test "imports the remote deck, resolving printings and summing split entries" do
      stub_deck([
        card_entry("Black Lotus", "scryfall-printing-3", 1, ["Commander"], "Foil"),
        card_entry("Time Walk", "scryfall-printing-2", 2),
        card_entry("Time Walk", "scryfall-printing-2", 1),
        card_entry("Unknown Card", "missing-printing", 1)
      ])

      {:ok, deck} = Catalog.create_deck(%{"name" => "Linked"})

      assert {:ok, %{deck: deck, unresolved: ["Unknown Card"]}} =
               Catalog.link_deck_external_source(deck, @url)

      assert deck.external_source == "archidekt"
      assert deck.external_url == "https://archidekt.com/decks/123456"
      assert %DateTime{} = deck.external_synced_at
      assert deck.external_sync_error == nil

      assert [
               %DeckCard{
                 oracle_id: "oracle-1",
                 zone: "commander",
                 quantity: 1,
                 finish: "foil",
                 preferred_printing_id: "scryfall-printing-3"
               },
               %DeckCard{
                 oracle_id: "oracle-2",
                 zone: "mainboard",
                 quantity: 3,
                 finish: "nonfoil",
                 preferred_printing_id: "scryfall-printing-2"
               }
             ] = deck_cards(deck)
    end

    test "falls back to name resolution when the printing is unknown" do
      stub_deck([card_entry("Black Lotus", "not-in-catalog", 1)])
      {:ok, deck} = Catalog.create_deck(%{"name" => "Linked"})

      assert {:ok, %{unresolved: []}} = Catalog.link_deck_external_source(deck, @url)
      assert [%DeckCard{oracle_id: "oracle-1", preferred_printing_id: nil}] = deck_cards(deck)
    end

    test "re-sync updates quantities, moves zones, removes cards, and keeps allocations" do
      {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})

      {:ok, item} =
        Catalog.create_collection_item(%{
          "scryfall_id" => "scryfall-printing-1",
          "quantity" => 4,
          "condition" => "near_mint",
          "language" => "en",
          "finish" => "nonfoil",
          "location_id" => binder.id
        })

      stub_deck([
        card_entry("Black Lotus", "scryfall-printing-1", 3),
        card_entry("Time Walk", "scryfall-printing-2", 1)
      ])

      {:ok, deck} = Catalog.create_deck(%{"name" => "Linked"})
      assert {:ok, %{deck: deck}} = Catalog.link_deck_external_source(deck, @url)
      [lotus, walk] = deck_cards(deck)
      {:ok, _} = Catalog.allocate_collection_item_to_deck_card(lotus.id, item.id, 3)

      # Remote: Lotus drops to 2 copies, Time Walk moves to the maybeboard (same row survives).
      stub_deck([
        card_entry("Black Lotus", "scryfall-printing-3", 2),
        card_entry("Time Walk", "scryfall-printing-2", 1, ["Maybeboard"])
      ])

      assert {:ok, %{deck: deck, unresolved: []}} = Catalog.sync_deck_external_source(deck)

      assert [
               %DeckCard{id: lotus_id, quantity: 2, preferred_printing_id: "scryfall-printing-1"},
               %DeckCard{id: walk_id, zone: "considering"}
             ] = deck_cards(deck)

      assert lotus_id == lotus.id
      assert walk_id == walk.id

      # Allocation trimmed to the new quantity; printing stayed pinned to the allocated copy.
      assert [%DeckAllocation{quantity: 2}] = Repo.all(DeckAllocation)
      assert binder_quantity(binder) == 2

      # Remote: Lotus removed entirely → its allocation is released back to the binder.
      stub_deck([card_entry("Time Walk", "scryfall-printing-2", 1)])
      assert {:ok, %{deck: deck}} = Catalog.sync_deck_external_source(deck)
      assert [%DeckCard{oracle_id: "oracle-2", zone: "mainboard"}] = deck_cards(deck)
      assert [] = Repo.all(DeckAllocation)
      assert binder_quantity(binder) == 4
    end

    test "records fetch failures on the deck and leaves the decklist alone" do
      stub_deck([card_entry("Black Lotus", "scryfall-printing-1", 1)])
      {:ok, deck} = Catalog.create_deck(%{"name" => "Linked"})
      assert {:ok, %{deck: deck}} = Catalog.link_deck_external_source(deck, @url)

      Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 404, "nope") end)
      assert {:error, {:http_error, 404}} = Catalog.sync_deck_external_source(deck)

      deck = Catalog.get_deck!(deck.id)
      assert deck.external_sync_error =~ "not found"
      assert [%DeckCard{oracle_id: "oracle-1"}] = deck_cards(deck)
    end

    test "rejects unsupported links and archived decks without changing the deck" do
      {:ok, deck} = Catalog.create_deck(%{"name" => "Linked"})

      assert {:error, :invalid_external_url} =
               Catalog.link_deck_external_source(deck, "https://example.com/decks/1")

      refute Catalog.get_deck!(deck.id).external_source

      {:ok, archived} = Catalog.update_deck(deck, %{"status" => "archived"})
      assert {:error, :deck_archived} = Catalog.link_deck_external_source(archived, @url)
    end
  end

  describe "edit guard" do
    test "linked decks reject decklist edits but allow allocations; unlinking restores edits" do
      {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})

      {:ok, item} =
        Catalog.create_collection_item(%{
          "scryfall_id" => "scryfall-printing-1",
          "quantity" => 1,
          "condition" => "near_mint",
          "language" => "en",
          "finish" => "nonfoil",
          "location_id" => binder.id
        })

      stub_deck([card_entry("Black Lotus", "scryfall-printing-1", 1)])
      {:ok, deck} = Catalog.create_deck(%{"name" => "Linked"})
      assert {:ok, %{deck: deck}} = Catalog.link_deck_external_source(deck, @url)
      [lotus] = deck_cards(deck)

      assert {:error, :deck_linked} = Catalog.add_card_to_deck(deck, %{"name" => "Time Walk"})
      assert {:error, :deck_linked} = Catalog.import_decklist(deck, "1 Time Walk")
      assert {:error, :deck_linked} = Catalog.update_deck_card(lotus, %{"quantity" => 2})
      assert {:error, :deck_linked} = Catalog.delete_deck_card(lotus)
      assert {:error, :deck_linked} = Catalog.bulk_add_collection_items_to_deck(deck, [item.id])
      assert {:error, :deck_linked} = Catalog.set_deck_commander(lotus)

      assert {:ok, _allocation} = Catalog.allocate_collection_item_to_deck_card(lotus.id, item.id)

      assert {:ok, _allocation} =
               Catalog.deallocate_collection_item_from_deck_card(lotus.id, item.id)

      assert {:ok, _deck_card} = Catalog.allocate_proxy_to_deck_card(lotus.id)

      assert {:ok, deck} = Catalog.unlink_deck_external_source(deck)
      refute deck.external_source
      assert {:ok, _} = Catalog.add_card_to_deck(deck, %{"name" => "Time Walk"})
      assert {:error, :deck_not_linked} = Catalog.unlink_deck_external_source(deck)
      assert {:error, :deck_not_linked} = Catalog.sync_deck_external_source(deck)
    end
  end

  describe "sync_all/0" do
    test "syncs linked non-archived decks only" do
      stub_deck([card_entry("Black Lotus", "scryfall-printing-1", 1)])
      {:ok, linked} = Catalog.create_deck(%{"name" => "Linked"})
      {:ok, %{deck: linked}} = Catalog.link_deck_external_source(linked, @url)
      {:ok, archived} = Catalog.create_deck(%{"name" => "Archived"})
      {:ok, %{deck: archived}} = Catalog.link_deck_external_source(archived, @url)
      {:ok, _archived} = Catalog.update_deck(archived, %{"status" => "archived"})
      {:ok, _plain} = Catalog.create_deck(%{"name" => "Plain"})

      linked_id = linked.id
      assert [{^linked_id, {:ok, _}}] = Catalog.sync_all_deck_external_sources()
    end
  end

  defp stub_deck(cards) do
    Req.Test.stub(@stub, fn conn ->
      Req.Test.json(conn, %{"name" => "Remote", "cards" => cards})
    end)
  end

  defp card_entry(name, uid, quantity, categories \\ [], modifier \\ "Normal") do
    %{
      "quantity" => quantity,
      "modifier" => modifier,
      "categories" => categories,
      "card" => %{"uid" => uid, "oracleCard" => %{"name" => name}}
    }
  end

  defp binder_quantity(binder) do
    [location_id: to_string(binder.id)]
    |> Catalog.list_collection_items()
    |> Enum.reduce(0, &(&1.quantity + &2))
  end

  defp deck_cards(deck) do
    DeckCard
    |> where([deck_card], deck_card.deck_id == ^deck.id)
    |> order_by([deck_card], asc: deck_card.oracle_id)
    |> Repo.all()
  end
end
