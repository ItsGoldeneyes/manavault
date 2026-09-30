defmodule Manavault.AI.AnalyzeDeckTest do
  use Manavault.DataCase, async: false

  alias Manavault.AI
  alias Manavault.AI.Settings
  alias Manavault.Catalog

  setup do
    %Settings{id: 1}
    |> Settings.changeset(%{
      provider: "openrouter",
      api_key: "test-openrouter-key",
      model: "anthropic/claude-opus-5.5"
    })
    |> Repo.insert!()

    {:ok, deck} = Catalog.create_deck(%{"name" => "Background analysis"})
    %{deck: deck}
  end

  test "individual and bulk refreshes reuse active jobs without clearing saved analysis", %{
    deck: deck
  } do
    deck = Repo.update!(Ecto.Changeset.change(deck, ai_analysis: "Previous analysis"))
    {:ok, other_deck} = Catalog.create_deck(%{"name" => "Other deck"})

    assert AI.latest_deck_analysis_job(deck.id) == nil
    assert {:ok, first} = AI.enqueue_deck_analysis(deck)
    assert {:ok, ^first} = AI.enqueue_deck_analysis(deck)
    assert {:ok, 2} = AI.refresh_all_deck_analyses()
    assert {:ok, 2} = AI.refresh_all_deck_analyses()
    assert AI.latest_deck_analysis_job(deck.id) == first
    assert %{status: "pending", deck_id: other_id} = AI.latest_deck_analysis_job(other_deck.id)
    assert other_id == other_deck.id
    assert Repo.aggregate(Oban.Job, :count) == 2
    assert Catalog.get_deck!(deck.id).ai_analysis == "Previous analysis"
  end

  test "status tracks retries and terminal outcomes and selects only this deck's latest analysis",
       %{deck: deck} do
    assert {:ok, %{id: id}} = AI.enqueue_deck_analysis(deck)

    for state <- ~w(available executing scheduled retryable) do
      set_state(id, state)
      assert %{id: ^id, status: "pending"} = AI.latest_deck_analysis_job(deck.id)
      assert {:ok, %{id: ^id}} = AI.enqueue_deck_analysis(deck)
    end

    for state <- ~w(discarded cancelled completed) do
      set_state(id, state)
      expected = if state == "completed", do: "completed", else: "failed"
      assert %{id: ^id, status: ^expected} = AI.latest_deck_analysis_job(deck.id)
    end

    assert {:ok, %{id: new_id}} = AI.enqueue_deck_analysis(deck)
    refute new_id == id

    %{deck_id: deck.id}
    |> Oban.Job.new(worker: "Manavault.AI.DeckQuestionWorker")
    |> Oban.insert!()

    assert %{id: ^new_id, status: "pending"} = AI.latest_deck_analysis_job(deck.id)
  end

  test "queueing rejects missing settings without creating work", %{deck: deck} do
    Repo.delete_all(Settings)
    assert {:error, message} = AI.enqueue_deck_analysis(deck)
    assert is_binary(message)
    assert Repo.aggregate(Oban.Job, :count) == 0
  end

  test "failed worker retries become terminal without replacing the old analysis", %{deck: deck} do
    previous = Application.get_env(:manavault, :openrouter_req_options)
    Application.put_env(:manavault, :openrouter_req_options, plug: {Req.Test, __MODULE__})

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :openrouter_req_options, previous)
      else
        Application.delete_env(:manavault, :openrouter_req_options)
      end
    end)

    Req.Test.stub(__MODULE__, fn conn ->
      conn
      |> Plug.Conn.put_status(400)
      |> Req.Test.json(%{error: %{message: "Provider rejected the schema"}})
    end)

    Repo.update!(Ecto.Changeset.change(deck, ai_analysis: "Previous analysis"))
    assert {:ok, %{id: id}} = AI.enqueue_deck_analysis(deck)

    ExUnit.CaptureLog.capture_log(fn ->
      for attempt <- 1..3 do
        result = Oban.drain_queue(queue: :ai, with_scheduled: true)
        assert result.success == 0
        assert result.failure + result.discard == 1
        expected = if attempt == 3, do: "failed", else: "pending"
        assert %{id: ^id, status: ^expected} = AI.latest_deck_analysis_job(deck.id)
      end
    end)

    assert Catalog.get_deck!(deck.id).ai_analysis == "Previous analysis"
    assert Repo.get!(Oban.Job, id).attempt == 3
  end

  defp set_state(id, state) do
    Oban.Job |> where(id: ^id) |> Repo.update_all(set: [state: state])
  end
end
