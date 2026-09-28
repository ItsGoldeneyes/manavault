defmodule Manavault.Scanner.BundleUpdateWorkerTest do
  use ExUnit.Case

  alias Manavault.Scanner.{Bundle, BundleUpdateWorker}

  @stub __MODULE__.Req

  setup do
    root = Path.join(System.tmp_dir!(), "scanner-updater-#{System.unique_integer([:positive])}")
    previous_dir = Application.get_env(:manavault, :scanner_bundle_dir)
    previous_source = Application.get_env(:manavault, :scanner_bundle_source)
    previous_req = Application.get_env(:manavault, :scanner_bundle_req_options)
    Application.put_env(:manavault, :scanner_bundle_dir, root)
    Application.put_env(:manavault, :scanner_bundle_req_options, plug: {Req.Test, @stub})

    on_exit(fn ->
      Application.put_env(:manavault, :scanner_bundle_dir, previous_dir)
      Application.put_env(:manavault, :scanner_bundle_source, previous_source)

      if previous_req,
        do: Application.put_env(:manavault, :scanner_bundle_req_options, previous_req),
        else: Application.delete_env(:manavault, :scanner_bundle_req_options)

      File.rm_rf!(root)
    end)

    :ok
  end

  test "off does not make a request" do
    Application.put_env(:manavault, :scanner_bundle_source, "off")
    assert {:ok, :disabled} = BundleUpdateWorker.check_for_update()
  end

  test "installs from a direct manifest and skips the same version" do
    Application.put_env(
      :manavault,
      :scanner_bundle_source,
      "https://models.test/v1/manifest.json"
    )

    manifest = manifest("v1")
    Req.Test.stub(@stub, &serve_direct(&1, manifest))

    assert {:ok, :installed} = BundleUpdateWorker.check_for_update()
    assert {:ok, %{"version" => "v1"}} = Bundle.current_manifest()
    assert {:ok, :current} = BundleUpdateWorker.check_for_update()
  end

  test "selects the newest scanner GitHub release" do
    Application.put_env(:manavault, :scanner_bundle_source, "github")
    manifest = manifest("v2")
    Req.Test.stub(@stub, &serve_github(&1, manifest))
    assert {:ok, :installed} = BundleUpdateWorker.check_for_update()
    assert {:ok, %{"version" => "v2"}} = Bundle.current_manifest()
  end

  test "treats a repository without published scanner releases as up to date" do
    Application.put_env(:manavault, :scanner_bundle_source, "github")

    Req.Test.stub(@stub, fn conn ->
      Req.Test.json(conn, [
        %{"tag_name" => "scanner-bundle-draft", "draft" => true, "assets" => []},
        %{"tag_name" => "v1.3.0", "draft" => false, "assets" => []}
      ])
    end)

    assert {:ok, :no_release} = BundleUpdateWorker.check_for_update()
    assert :ok = BundleUpdateWorker.perform(%Oban.Job{args: %{}})
  end

  defp manifest(version) do
    files = bodies()

    %{
      "version" => version,
      "created" => "now",
      "files" =>
        Map.new(files, fn {name, body} ->
          {name, %{"bytes" => byte_size(body), "sha256" => sha(body)}}
        end)
    }
  end

  defp bodies,
    do: %{"arts.json" => "[]", "detector.onnx" => "d", "embed.onnx" => "e", "search.onnx" => "s"}

  defp serve_direct(conn, manifest) do
    name = Path.basename(conn.request_path)

    body =
      if name == "manifest.json",
        do: Jason.encode!(manifest),
        else: Map.get(bodies(), name, "checksums")

    Plug.Conn.send_resp(conn, 200, body)
  end

  defp serve_github(%{request_path: "/repos/cfbender/manavault/releases"} = conn, _manifest) do
    assets =
      ["manifest.json", "SHA256SUMS" | Map.keys(bodies())]
      |> Enum.map(&%{"name" => &1, "browser_download_url" => "https://downloads.test/#{&1}"})

    releases = [
      %{
        "draft" => false,
        "tag_name" => "scanner-bundle-v2",
        "published_at" => "2026-02-01",
        "assets" => assets
      },
      %{
        "draft" => false,
        "tag_name" => "scanner-bundle-old",
        "published_at" => "2026-01-01",
        "assets" => []
      }
    ]

    conn
    |> Plug.Conn.put_resp_content_type("application/json")
    |> Plug.Conn.send_resp(200, Jason.encode!(releases))
  end

  defp serve_github(conn, manifest), do: serve_direct(conn, manifest)
  defp sha(body), do: :crypto.hash(:sha256, body) |> Base.encode16(case: :lower)
end
