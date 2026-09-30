defmodule Manavault.Catalog.Decks.QuestionAnswers do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Deck, DeckQuestionAnswer}
  alias Manavault.Repo

  @doc "Saved Ask AI conversations, newest first. Swap cards chat turns are excluded."
  def list_deck_question_answers(%Deck{id: deck_id}) do
    DeckQuestionAnswer
    |> where([question_answer], question_answer.deck_id == ^deck_id)
    |> where([question_answer], is_nil(question_answer.thread_id))
    |> order_by([question_answer], desc: question_answer.inserted_at, desc: question_answer.id)
    |> Repo.all()
  end

  @doc "Turns of one Swap cards chat thread, oldest first."
  def list_deck_question_thread(%Deck{id: deck_id}, thread_id) when is_binary(thread_id) do
    DeckQuestionAnswer
    |> where([question_answer], question_answer.deck_id == ^deck_id)
    |> where([question_answer], question_answer.thread_id == ^thread_id)
    |> order_by([question_answer], asc: question_answer.inserted_at, asc: question_answer.id)
    |> Repo.all()
  end

  def get_deck_question_answer(id), do: Repo.get(DeckQuestionAnswer, id)

  @doc "Recent completed turns from the same chat, before this question, oldest first."
  def deck_question_history(%DeckQuestionAnswer{} = turn, count) do
    thread_filter =
      if is_nil(turn.thread_id),
        do: dynamic([answer], is_nil(answer.thread_id)),
        else: dynamic([answer], answer.thread_id == ^turn.thread_id)

    conversation_filter =
      if is_nil(turn.conversation_id),
        do: dynamic([answer], is_nil(answer.conversation_id)),
        else: dynamic([answer], answer.conversation_id == ^turn.conversation_id)

    DeckQuestionAnswer
    |> where([answer], answer.deck_id == ^turn.deck_id and answer.id < ^turn.id)
    |> where([answer], answer.status == "completed")
    |> where(^thread_filter)
    |> where(^conversation_filter)
    |> order_by([answer], desc: answer.inserted_at, desc: answer.id)
    |> limit(^count)
    |> select([answer], %{question: answer.question, answer: answer.answer})
    |> Repo.all()
    |> Enum.reverse()
  end

  def create_deck_question_answer(%Deck{} = deck, attrs) when is_map(attrs) do
    deck
    |> change_deck_question_answer(attrs)
    |> Repo.insert()
  end

  def change_deck_question_answer(%Deck{id: deck_id}, attrs) when is_map(attrs) do
    %DeckQuestionAnswer{}
    |> DeckQuestionAnswer.changeset(Map.put(attrs, :deck_id, deck_id))
  end

  def complete_deck_question_answer(%DeckQuestionAnswer{} = question_answer, attrs) do
    attrs = Map.merge(attrs, %{status: "completed", error: nil})

    question_answer
    |> DeckQuestionAnswer.changeset(attrs)
    |> Repo.update()
  end

  def fail_deck_question_answer(%DeckQuestionAnswer{} = question_answer, error) do
    question_answer
    |> DeckQuestionAnswer.changeset(%{status: "failed", error: error})
    |> Repo.update()
  end

  def delete_deck_question_answer(%DeckQuestionAnswer{} = question_answer) do
    Repo.delete(question_answer)
  end
end
