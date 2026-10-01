defmodule Manavault.ObanLogger do
  @moduledoc """
  Logs Oban job failures. Oban only records a crashed job's error on the job
  row unless a telemetry handler is attached, which leaves retries looking like
  unexplained restarts in the application log.
  """

  require Logger

  @handler_id "manavault-oban-logger"

  def attach do
    :telemetry.attach(@handler_id, [:oban, :job, :exception], &__MODULE__.handle_event/4, nil)
  end

  def handle_event([:oban, :job, :exception], _measurements, meta, nil) do
    %{worker: worker, queue: queue, attempt: attempt, max_attempts: max_attempts} = meta

    Logger.error(
      "Oban job failed worker=#{worker} queue=#{queue} attempt=#{attempt}/#{max_attempts} " <>
        "state=#{meta.state}\n" <>
        Exception.format(meta.kind, meta.reason, meta.stacktrace)
    )
  end
end
