defmodule ManavaultWeb.Schema.DeckExternalSourceTest do
  use ManavaultWeb.ConnCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog

  @stub __MODULE__.Stub
  @url "https://archidekt.com/decks/123456/my-deck"

  @link_mutation """
  mutation Link($id: ID!, $url: String!) {
    linkDeckExternalSource(id: $id, url: $url) {
      unresolved
      deck { id cardCount externalSource externalUrl externalSyncedAt externalSyncError }
    }
  }
  """

  @sync_mutation """
  mutation Sync($id: ID!) {
    syncDeckExternalSource(id: $id) {
      unresolved
      deck { cardCount externalSyncError }
    }
  }
  """

  @unlink_mutation """
  mutation Unlink($id: ID!) {
    unlinkDeckExternalSource(id: $id) {
      deck { cardCount externalSource externalUrl }
    }
  }
  """

  @add_card_mutation """
  mutation AddCard($deckId: ID!, $input: DeckCardInput!) {
    addDeckCard(deckId: $deckId, input: $input) {
      deckCard { id }
    }
  }
  """

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

    assert {:ok, _result} = Catalog.import_cards([@black_lotus, @time_walk])
    {:ok, deck} = Catalog.create_deck(%{"name" => "Linked API"})
    %{deck: deck, deck_id: Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)}
  end

  test "links, blocks decklist edits, re-syncs, and unlinks", %{conn: conn, deck_id: deck_id} do
    stub_deck([card_entry("Black Lotus", 1, ["Commander"]), card_entry("Time Walk", 2)])

    conn = graphql(conn, @link_mutation, %{"id" => deck_id, "url" => @url})

    assert %{
             "data" => %{
               "linkDeckExternalSource" => %{
                 "unresolved" => [],
                 "deck" => %{
                   "id" => ^deck_id,
                   "cardCount" => 3,
                   "externalSource" => "archidekt",
                   "externalUrl" => "https://archidekt.com/decks/123456",
                   "externalSyncedAt" => synced_at,
                   "externalSyncError" => nil
                 }
               }
             }
           } = json_response(conn, 200)

    assert is_binary(synced_at)

    conn =
      graphql(recycle(conn), @add_card_mutation, %{
        "deckId" => deck_id,
        "input" => %{"name" => "Time Walk"}
      })

    assert %{"data" => %{"addDeckCard" => nil}, "errors" => [%{"message" => message}]} =
             json_response(conn, 200)

    assert message =~ "linked to an external deck"

    # The remote list shrank: sync drops Black Lotus and lowers Time Walk.
    stub_deck([card_entry("Time Walk", 1)])
    conn = graphql(recycle(conn), @sync_mutation, %{"id" => deck_id})

    assert %{
             "data" => %{
               "syncDeckExternalSource" => %{
                 "unresolved" => [],
                 "deck" => %{"cardCount" => 1, "externalSyncError" => nil}
               }
             }
           } = json_response(conn, 200)

    conn = graphql(recycle(conn), @unlink_mutation, %{"id" => deck_id})

    assert %{
             "data" => %{
               "unlinkDeckExternalSource" => %{
                 "deck" => %{"cardCount" => 1, "externalSource" => nil, "externalUrl" => nil}
               }
             }
           } = json_response(conn, 200)

    conn =
      graphql(recycle(conn), @add_card_mutation, %{
        "deckId" => deck_id,
        "input" => %{"name" => "Black Lotus"}
      })

    assert %{"data" => %{"addDeckCard" => %{"deckCard" => %{"id" => _}}}} =
             json_response(conn, 200)
  end

  test "rejects unsupported links with a readable error", %{conn: conn, deck_id: deck_id} do
    conn = graphql(conn, @link_mutation, %{"id" => deck_id, "url" => "https://tappedout.net/x"})

    assert %{"data" => %{"linkDeckExternalSource" => nil}, "errors" => [%{"message" => message}]} =
             json_response(conn, 200)

    assert message =~ "Moxfield or Archidekt"
  end

  test "surfaces a failed fetch and leaves the deck unlinked", %{conn: conn, deck_id: deck_id} do
    Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 404, "nope") end)
    conn = graphql(conn, @link_mutation, %{"id" => deck_id, "url" => @url})

    assert %{"data" => %{"linkDeckExternalSource" => nil}, "errors" => [%{"message" => _}]} =
             json_response(conn, 200)

    assert %{"data" => %{"syncDeckExternalSource" => nil}, "errors" => [%{"message" => message}]} =
             conn
             |> recycle()
             |> graphql(@sync_mutation, %{"id" => deck_id})
             |> json_response(200)

    assert message =~ "not linked"
  end

  defp graphql(conn, query, variables) do
    post(conn, "/api/graphql", %{"query" => query, "variables" => variables})
  end

  defp stub_deck(cards) do
    Req.Test.stub(@stub, fn conn ->
      Req.Test.json(conn, %{"name" => "Remote", "cards" => cards})
    end)
  end

  defp card_entry(name, quantity, categories \\ []) do
    %{
      "quantity" => quantity,
      "modifier" => "Normal",
      "categories" => categories,
      "card" => %{"uid" => "unknown-#{name}", "oracleCard" => %{"name" => name}}
    }
  end
end
