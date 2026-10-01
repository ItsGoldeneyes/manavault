defmodule Manavault.Pricing.SyncTest do
  use Manavault.DataCase, async: false

  import ExUnit.CaptureLog

  alias Manavault.Pricing.{Sync, VendorPrice}

  defmodule CrashingVendor do
    def sync_interval, do: :timer.hours(1)
    def fetch, do: raise(Exqlite.Error, message: "Database busy")
  end

  defmodule HealthyVendor do
    def sync_interval, do: :timer.hours(1)
    def fetch, do: {:ok, [%{scryfall_id: "healthy", finish: "nonfoil", price_cents: 250}]}
  end

  setup do
    Application.put_env(:manavault, :pricing_vendor_modules, %{
      "cardkingdom" => CrashingVendor,
      "manapool" => HealthyVendor
    })

    on_exit(fn -> Application.delete_env(:manavault, :pricing_vendor_modules) end)
  end

  test "a vendor that raises is reported as an error and later vendors still sync" do
    log =
      capture_log(fn ->
        assert {:ok,
                [
                  {"cardkingdom", {:error, %Exqlite.Error{message: "Database busy"}}},
                  {"manapool", {:ok, 1}}
                ]} = Sync.run(["cardkingdom", "manapool"])
      end)

    assert log =~ "Vendor price sync crashed vendor=cardkingdom"
    assert log =~ "Database busy"

    assert [%VendorPrice{vendor: "manapool", scryfall_id: "healthy", price_cents: 250}] =
             Repo.all(VendorPrice)
  end
end
