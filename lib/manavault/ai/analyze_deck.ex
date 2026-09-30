defmodule Manavault.AI.AnalyzeDeck do
  @moduledoc false

  import Ecto.Query

  alias Manavault.AI.{DeckAnalysis, DeckAnalysisWorker, Provider, UpdateSettings}
  alias Manavault.Catalog
  alias Manavault.Catalog.Deck
  alias Manavault.Repo

  def enqueue(%Deck{} = deck) do
    with :ok <- UpdateSettings.settings() |> UpdateSettings.configured(),
         {:ok, job} <- deck.id |> job_changeset() |> Oban.insert() do
      {:ok, progress(job)}
    end
  end

  def latest_job(deck_id) do
    Oban.Job
    |> where([job], job.worker == "Manavault.AI.DeckAnalysisWorker")
    |> where([job], job.args["deck_id"] == ^deck_id)
    |> order_by(desc: :id)
    |> limit(1)
    |> Repo.one()
    |> case do
      nil -> nil
      job -> progress(job)
    end
  end

  def run(%Deck{} = deck) do
    settings = UpdateSettings.settings()

    with :ok <- UpdateSettings.configured(settings),
         payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
         {:ok, result} <- analyze_payload(settings, payload) do
      Catalog.save_deck_analysis(deck, analysis_attrs(result, settings))
    end
  end

  def refresh_all do
    with :ok <- UpdateSettings.settings() |> UpdateSettings.configured() do
      # insert_all bypasses job uniqueness; use the same per-deck deduplication
      # as the Analyze action so bulk and individual refreshes can overlap safely.
      Repo.transaction(fn ->
        decks = Catalog.list_decks()
        Enum.each(decks, &(&1.id |> job_changeset() |> Oban.insert!()))
        length(decks)
      end)
    end
  end

  def analyze_payload(settings, payload) do
    with {:ok, provider} <- Provider.module(settings.provider),
         {:ok, provider_result} <- provider.analyze_deck(settings, payload) do
      DeckAnalysis.normalize_result(
        provider_result,
        payload,
        settings.deck_analysis_instructions
      )
    end
  end

  defp job_changeset(deck_id), do: DeckAnalysisWorker.new(%{"deck_id" => deck_id})

  defp progress(job) do
    status =
      case job.state do
        "completed" -> "completed"
        state when state in ["discarded", "cancelled"] -> "failed"
        _active -> "pending"
      end

    %{id: job.id, deck_id: job.args["deck_id"], status: status}
  end

  defp analysis_attrs(result, settings) do
    %{
      ai_analysis: DeckAnalysis.render_markdown(result),
      ai_analysis_model: settings.model,
      ai_analyzed_at: DateTime.utc_now() |> DateTime.truncate(:second),
      commander_bracket: result.official_bracket,
      commander_bracket_estimate: result.play_bracket,
      commander_bracket_rating: result.bracket_rating
    }
  end
end
