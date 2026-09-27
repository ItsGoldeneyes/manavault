defmodule Manavault.AI.CardLookupTool do
  @moduledoc """
  Function tool that lets the AI provider look up cards in ManaVault's local
  Scryfall catalog. Models cannot know cards printed after their training
  data, so before recommending an addition they can fetch the card's real
  rules text, color identity, and legality from the same catalog ManaVault
  uses to validate recommendations.
  """

  alias Manavault.AI.Tools
  alias Manavault.Catalog.Util

  @tool_name "lookup_cards"
  @max_names 20

  def tool_name, do: @tool_name

  @doc "OpenAI-style function tool definition."
  def definition do
    %{
      type: "function",
      function: %{
        name: @tool_name,
        description:
          "Look up Magic: The Gathering cards by exact name in ManaVault's Scryfall catalog. " <>
            "Returns each card's mana cost, type line, oracle text, color identity, and the " <>
            "formats it is legal in. Use it to verify any card you consider recommending " <>
            "that is not in the deck, especially cards from recent sets that may be newer " <>
            "than your training data. Names not found in the catalog are listed in not_found.",
        parameters: %{
          type: "object",
          additionalProperties: false,
          properties: %{
            names: %{
              type: "array",
              items: %{type: "string"},
              minItems: 1,
              maxItems: @max_names,
              description:
                "Exact English card names to look up (up to #{@max_names}). " <>
                  "The front face name is enough for double-faced cards."
            }
          },
          required: ["names"]
        }
      }
    }
  end

  @doc """
  Executes a tool call. Always returns a JSON-encodable map so the model gets
  actionable feedback (including for malformed calls) instead of the request
  failing.
  """
  def call(%{"names" => names}) when is_list(names) do
    {cards, not_found} = Tools.resolve_cards(names, @max_names)
    %{cards: Enum.map(cards, &card_details/1), not_found: not_found}
  end

  def call(_arguments), do: %{error: "Provide a names array of exact card names."}

  defp card_details(card) do
    legalities = Util.decode_json(card.legalities, %{})

    %{
      name: card.name,
      mana_cost: card.mana_cost,
      mana_value: card.cmc,
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      color_identity: Util.decode_json(card.color_identity, []),
      legal_in: legalities |> Enum.filter(&legal?/1) |> Enum.map(&elem(&1, 0)) |> Enum.sort(),
      game_changer: card.game_changer || false
    }
  end

  defp legal?({_format, status}), do: status in ~w(legal restricted)
end
