defmodule Manavault.AI.ToolsTest do
  use Manavault.DataCase, async: false

  alias Manavault.AI.Tools

  test "offers the card lookup and collection status tools" do
    assert ["lookup_cards", "check_collection"] =
             Enum.map(Tools.definitions(), & &1.function.name)
  end

  test "dispatches calls by tool name" do
    assert %{cards: [], not_found: ["Made Up Card"]} =
             Tools.call("lookup_cards", %{"names" => ["Made Up Card"]})

    assert %{cards: [], not_found: ["Made Up Card"]} =
             Tools.call("check_collection", %{"names" => ["Made Up Card"]})
  end

  test "describes unknown tools instead of failing" do
    assert %{error: error} = Tools.call("search_web", %{"query" => "Sol Ring"})
    assert error =~ ~s(Unknown tool "search_web")
    assert error =~ "lookup_cards, check_collection"
  end
end
