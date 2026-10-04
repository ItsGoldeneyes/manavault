defmodule Manavault.Catalog.Decks.ExternalDeckSyncWorker do
  @moduledoc """
  Hourly cron job that re-syncs every deck linked to Moxfield or Archidekt.
  Per-deck failures are recorded on the deck itself, so the job only logs.
  """

  use Oban.Worker,
    queue: :catalog,
    max_attempts: 1,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.Catalog

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    results = Catalog.sync_all_deck_external_sources()

    {ok, failed} = Enum.split_with(results, fn {_deck_id, result} -> match?({:ok, _}, result) end)

    unless results == [] do
      Logger.info("External deck sync finished ok=#{length(ok)} failed=#{length(failed)}")
    end

    Enum.each(failed, fn {deck_id, {:error, reason}} ->
      Logger.warning("External deck sync failed for deck #{deck_id}: #{inspect(reason)}")
    end)

    :ok
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(15)
end
