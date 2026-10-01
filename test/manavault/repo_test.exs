defmodule Manavault.RepoTest do
  use ExUnit.Case, async: true

  import ExUnit.CaptureLog

  alias Manavault.Repo

  @busy %Exqlite.Error{message: "Database busy", statement: "INSERT INTO \"vendor_prices\""}

  describe "retry_when_busy/3" do
    test "retries a busy write until it succeeds and logs each wait" do
      fun = failing_then_succeeding(2, @busy, :written)

      log =
        capture_log(fn ->
          assert Repo.retry_when_busy(fun, "Vendor price sync vendor=cardkingdom", [1, 1, 1]) ==
                   :written
        end)

      assert length(Regex.scan(~r/hit a busy database; retrying in 1ms/, log)) == 2
      assert log =~ "Vendor price sync vendor=cardkingdom"
    end

    test "re-raises once the delays are exhausted" do
      fun = failing_then_succeeding(3, @busy, :written)

      capture_log(fn ->
        assert_raise Exqlite.Error, ~r/Database busy/, fn ->
          Repo.retry_when_busy(fun, "test", [1, 1])
        end
      end)
    end

    test "does not retry other SQLite errors" do
      fun = failing_then_succeeding(1, %Exqlite.Error{message: "UNIQUE constraint failed"}, :ok)

      assert_raise Exqlite.Error, ~r/UNIQUE constraint failed/, fn ->
        Repo.retry_when_busy(fun, "test", [1, 1])
      end
    end
  end

  defp failing_then_succeeding(failures, error, result) do
    {:ok, counter} = Agent.start_link(fn -> 0 end)

    fn ->
      attempt = Agent.get_and_update(counter, fn count -> {count + 1, count + 1} end)
      if attempt <= failures, do: raise(error), else: result
    end
  end
end
