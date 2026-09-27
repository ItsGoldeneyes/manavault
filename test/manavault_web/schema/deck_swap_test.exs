defmodule ManavaultWeb.Schema.DeckSwapTest do
  use ManavaultWeb.ConnCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog
  alias Manavault.Catalog.DeckCard
  alias Manavault.Repo

  @preview_query """
  query DeckSwapPreview($deckId: ID!, $input: DeckSwapInput!) {
    deckSwapPreview(deckId: $deckId, input: $input) {
      cardCount
      unresolvedNames
      legality { status issues { code cardName } }
    }
  }
  """

  @apply_mutation """
  mutation ApplyDeckSwap($deckId: ID!, $input: DeckSwapInput!) {
    applyDeckSwap(deckId: $deckId, input: $input) {
      deck { id cardCount legality { status } }
    }
  }
  """

  defp global_id(type, id), do: Absinthe.Relay.Node.to_global_id(type, id, ManavaultWeb.Schema)

  setup do
    assert {:ok, _result} =
             Catalog.import_cards([
               legal_commander_card(),
               legal_plains(),
               legality_card("Silver Bolt", ["W"], %{"commander" => "legal"}),
               legality_card("Red Bolt", ["R"], %{"commander" => "legal"})
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Swap API", "format" => "commander"})
    add_deck_card!(deck, "Test Commander", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")
    silver_bolt = add_deck_card!(deck, "Silver Bolt", 1, "mainboard")

    %{deck: deck, silver_bolt: silver_bolt}
  end

  test "previews and applies a swap", %{conn: conn, deck: deck, silver_bolt: silver_bolt} do
    variables = %{
      "deckId" => global_id(:deck, deck.id),
      "input" => %{
        "cuts" => [
          %{
            "deckCardId" => global_id(:deck_card, silver_bolt.id),
            "quantity" => 1,
            "destination" => "CONSIDERING"
          }
        ],
        "adds" => [%{"name" => "Red Bolt", "quantity" => 1}]
      }
    }

    preview_conn =
      post(conn, "/api/graphql", %{"query" => @preview_query, "variables" => variables})

    assert %{
             "data" => %{
               "deckSwapPreview" => %{
                 "cardCount" => 100,
                 "unresolvedNames" => [],
                 "legality" => %{
                   "status" => "illegal",
                   "issues" => [%{"code" => "commander_color_identity", "cardName" => "Red Bolt"}]
                 }
               }
             }
           } = json_response(preview_conn, 200)

    apply_conn =
      post(conn, "/api/graphql", %{"query" => @apply_mutation, "variables" => variables})

    assert %{
             "data" => %{
               "applyDeckSwap" => %{
                 "deck" => %{"cardCount" => 100, "legality" => %{"status" => "illegal"}}
               }
             }
           } = json_response(apply_conn, 200)

    assert Repo.get!(DeckCard, silver_bolt.id).zone == "considering"
  end

  test "returns a readable error for invalid swaps", %{conn: conn, deck: deck} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => @apply_mutation,
        "variables" => %{
          "deckId" => global_id(:deck, deck.id),
          "input" => %{"cuts" => [], "adds" => []}
        }
      })

    assert %{"errors" => [%{"message" => "Stage at least one cut or add before swapping."}]} =
             json_response(conn, 200)
  end
end
