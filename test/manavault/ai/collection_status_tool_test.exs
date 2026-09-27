defmodule Manavault.AI.CollectionStatusToolTest do
  use Manavault.DataCase, async: false

  use Manavault.CatalogTestFixtures,
    fixtures: [:black_lotus, :black_lotus_beta, :time_walk, :plains]

  alias Manavault.AI.CollectionStatusTool
  alias Manavault.Catalog
  alias Manavault.CatalogTestSupport

  test "exposes a function tool definition" do
    assert %{type: "function", function: %{name: "check_collection", parameters: parameters}} =
             CollectionStatusTool.definition()

    assert parameters.required == ["names"]
    assert parameters.properties.names.type == "array"
  end

  test "reports owned, free, and in-deck copies for each card" do
    assert {:ok, _counts} =
             Catalog.import_cards([
               @black_lotus,
               @black_lotus_beta,
               @time_walk,
               @plains,
               CatalogTestSupport.legal_commander_card()
             ])

    assert {:ok, _free_lotus} =
             Catalog.create_collection_item(%{"scryfall_id" => "scryfall-printing-1"})

    assert {:ok, used_lotus} =
             Catalog.create_collection_item(%{"scryfall_id" => "scryfall-printing-3"})

    assert {:ok, used_walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "finish" => "foil"
             })

    assert {:ok, other_deck} = Catalog.create_deck(%{"name" => "Other", "status" => "active"})
    allocate!(other_deck, "Black Lotus", used_lotus)
    allocate!(other_deck, "Time Walk", used_walk)

    result =
      CollectionStatusTool.call(%{
        "names" => ["black lotus", "Time Walk", "Test Commander", "Plains", "Made Up Card", " "]
      })

    assert result.not_found == ["Made Up Card"]

    assert [lotus, walk, commander, plains] = result.cards

    assert lotus == %{
             name: "Black Lotus",
             status: "available",
             owned: 2,
             available: 1,
             in_other_decks: 1
           }

    assert walk == %{
             name: "Time Walk",
             status: "owned_in_other_decks",
             owned: 1,
             available: 0,
             in_other_decks: 1
           }

    assert %{name: "Test Commander", status: "not_owned", owned: 0, available: 0} = commander
    assert %{name: "Plains", status: "basic_land"} = plains

    assert {:ok, _json} = Jason.encode(result)
  end

  test "describes malformed calls instead of failing" do
    assert %{error: error} = CollectionStatusTool.call(%{"names" => "Sol Ring"})
    assert error =~ "names array"
  end

  defp allocate!(deck, name, collection_item) do
    assert {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => name})

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, collection_item.id)
  end
end
