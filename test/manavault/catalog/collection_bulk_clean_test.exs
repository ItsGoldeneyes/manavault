defmodule Manavault.Catalog.CollectionBulkCleanTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:plains]

  alias Manavault.Catalog

  setup do
    elves =
      legality_card("Llanowar Elves", ["G"], %{"commander" => "legal"}, %{
        "type_line" => "Creature — Elf Druid"
      })

    assert {:ok, _result} =
             Catalog.import_cards([
               Map.merge(elves, %{"id" => "elves-a", "prices" => %{"usd" => "0.10"}}),
               Map.merge(elves, %{
                 "id" => "elves-b",
                 "collector_number" => "b",
                 "prices" => %{"usd" => "0.05"}
               }),
               Map.merge(elves, %{
                 "id" => "elves-c",
                 "collector_number" => "c",
                 "prices" => %{"usd" => "1.00"}
               }),
               @plains
             ])

    {:ok, box} = Catalog.create_location(%{name: "Box A", kind: "box"})
    {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})
    {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    box_item = create_item!("elves-a", 5, box.id)
    unfiled_item = create_item!("elves-b", 3, nil)
    binder_item = create_item!("elves-b", 4, binder.id)
    create_item!("elves-c", 20, box.id)
    create_item!("elves-a", 2, list.id)
    create_item!("scryfall-printing-basic-plains", 6, box.id)

    allocated = create_item!("elves-a", 1, box.id)
    {:ok, deck} = Catalog.create_deck(%{"name" => "Elves"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Llanowar Elves"})
    {:ok, _allocation} = Catalog.allocate_collection_item_to_deck_card(deck_card.id, allocated.id)

    %{
      box: box,
      binder: binder,
      box_item: box_item,
      unfiled: unfiled_item,
      binder_item: binder_item
    }
  end

  test "pulls surplus loose copies of cheap cards, cheapest printings and largest stacks first",
       context do
    assert {:ok, result} = Catalog.collection_bulk_clean()

    assert %{
             max_price_cents: 20,
             min_copies: 10,
             keep_copies: 4,
             card_count: 1,
             pull_quantity: 8,
             pull_value_cents: 45,
             cards: [%{card_name: "Llanowar Elves", total_copies: 12, pulls: pulls}]
           } = result

    assert Enum.map(pulls, &{&1.collection_item_id, &1.quantity, &1.from_location_name}) == [
             {context.binder_item.id, 4, "Binder"},
             {context.unfiled.id, 3, "Unfiled"},
             {context.box_item.id, 1, "Box A"}
           ]

    assert %{price_cents: 10, owned_quantity: 5, from_location_id: box_id} = List.last(pulls)
    assert box_id == context.box.id
  end

  test "thresholds are configurable" do
    assert {:ok, %{cards: []}} = Catalog.collection_bulk_clean(min_copies: 13)
    assert {:ok, %{cards: []}} = Catalog.collection_bulk_clean(max_price_cents: 6)
    assert {:ok, %{cards: []}} = Catalog.collection_bulk_clean(keep_copies: 12)

    assert {:ok, %{cards: cards, pull_quantity: 18}} =
             Catalog.collection_bulk_clean(min_copies: 5, keep_copies: 0)

    assert Enum.map(cards, &{&1.card_name, &1.pull_quantity}) == [
             {"Llanowar Elves", 12},
             {"Plains", 6}
           ]
  end

  defp create_item!(scryfall_id, quantity, location_id) do
    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: scryfall_id,
        quantity: quantity,
        location_id: location_id
      })

    item
  end
end
