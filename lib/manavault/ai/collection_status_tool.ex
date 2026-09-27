defmodule Manavault.AI.CollectionStatusTool do
  @moduledoc """
  Function tool that lets the AI provider check whether the user already owns
  cards it is considering recommending, so it can favor cards the user can
  add without buying anything. Statuses come from the same collection check
  ManaVault shows beside EDHREC and Recommander suggestions.
  """

  alias Manavault.AI.Tools
  alias Manavault.Catalog.EDHRec.Response.CollectionStatus

  @tool_name "check_collection"
  @max_names 40

  def tool_name, do: @tool_name

  @doc "OpenAI-style function tool definition."
  def definition do
    %{
      type: "function",
      function: %{
        name: @tool_name,
        description:
          "Check the user's ManaVault collection for Magic: The Gathering cards by exact name. " <>
            "For each card, returns status plus copy counts: available means the user owns a " <>
            "copy not used by another active deck; owned_in_other_decks means every owned copy " <>
            "is already in another active deck; not_owned means the user has no copies; " <>
            "basic_land means it is always available. Use it on candidate additions that are " <>
            "not in the deck before recommending them. You can call it in the same turn as " <>
            "lookup_cards. Names not found in the catalog are listed in not_found.",
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
                "Exact English card names to check (up to #{@max_names}). " <>
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
    prefetch = cards |> Enum.map(& &1.oracle_id) |> CollectionStatus.prefetch()

    %{
      cards: Enum.map(cards, &card_status(&1, CollectionStatus.status(&1, nil, prefetch))),
      not_found: not_found
    }
  end

  def call(_arguments), do: %{error: "Provide a names array of exact card names."}

  defp card_status(card, status) do
    %{
      name: card.name,
      status: model_status(status.state),
      owned: status.owned,
      available: status.available,
      in_other_decks: status.allocated_elsewhere
    }
  end

  # CollectionStatus uses UI-oriented state names; spell them out for the model.
  defp model_status("available"), do: "available"
  defp model_status("partial"), do: "owned_in_other_decks"
  defp model_status("basic_land"), do: "basic_land"
  defp model_status(_missing), do: "not_owned"
end
