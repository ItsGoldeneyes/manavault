defmodule Manavault.AI.Tools do
  @moduledoc """
  Function tools offered to the AI provider during deck analysis and deck
  questions: catalog lookup (`lookup_cards`) and collection status
  (`check_collection`).
  """

  alias Manavault.AI.{CardLookupTool, CollectionStatusTool}
  alias Manavault.Catalog.Search.CardsByName

  @tools [CardLookupTool, CollectionStatusTool]

  @doc "OpenAI-style function tool definitions to send with every completion request."
  def definitions, do: Enum.map(@tools, & &1.definition())

  @doc """
  Executes a tool call by name. Always returns a JSON-encodable map, including
  for unknown tools, so the model gets feedback instead of the request failing.
  """
  def call(name, arguments) do
    case Enum.find(@tools, &(&1.tool_name() == name)) do
      nil ->
        available = @tools |> Enum.map(& &1.tool_name()) |> Enum.join(", ")
        %{error: "Unknown tool #{inspect(name)}. Available tools: #{available}."}

      tool ->
        tool.call(arguments)
    end
  end

  @doc """
  Resolves model-supplied card names against the catalog. Returns
  `{cards, not_found_names}` in request order, ignoring blank and duplicate
  names and keeping at most `max_names`.
  """
  def resolve_cards(names, max_names) when is_list(names) do
    names =
      names
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq_by(&CardsByName.key/1)
      |> Enum.take(max_names)

    cards = CardsByName.by_names(names)

    {found, not_found} =
      Enum.reduce(names, {[], []}, fn name, {found, not_found} ->
        case Map.get(cards, CardsByName.key(name)) do
          nil -> {found, [name | not_found]}
          card -> {[card | found], not_found}
        end
      end)

    {Enum.reverse(found), Enum.reverse(not_found)}
  end
end
