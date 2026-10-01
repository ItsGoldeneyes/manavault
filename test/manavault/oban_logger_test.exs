defmodule Manavault.ObanLoggerTest do
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias Manavault.ObanLogger

  test "is attached at application start and logs job exceptions with the reason" do
    assert ObanLogger.attach() == {:error, :already_exists}

    log =
      capture_log(fn ->
        :telemetry.execute([:oban, :job, :exception], %{duration: 1}, %{
          worker: "Manavault.Pricing.VendorSyncWorker",
          queue: "pricing",
          attempt: 1,
          max_attempts: 3,
          state: :failure,
          kind: :error,
          reason: %RuntimeError{message: "feed exploded"},
          stacktrace: []
        })
      end)

    assert log =~
             "Oban job failed worker=Manavault.Pricing.VendorSyncWorker queue=pricing attempt=1/3 state=failure"

    assert log =~ "** (RuntimeError) feed exploded"
  end
end
