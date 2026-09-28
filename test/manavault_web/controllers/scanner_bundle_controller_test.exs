defmodule ManavaultWeb.ScannerBundleControllerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Scanner.Bundle

  setup do
    root =
      Path.join(System.tmp_dir!(), "scanner-controller-#{System.unique_integer([:positive])}")

    previous = Application.get_env(:manavault, :scanner_bundle_dir)
    Application.put_env(:manavault, :scanner_bundle_dir, root)

    on_exit(fn ->
      Application.put_env(:manavault, :scanner_bundle_dir, previous)
      File.rm_rf!(root)
    end)

    {:ok, root: root}
  end

  test "returns 404 when no bundle is installed", %{conn: conn} do
    assert %{"errors" => _} = conn |> get("/api/scanner/bundle") |> json_response(404)
  end

  test "describes and serves an immutable versioned bundle", %{conn: conn, root: root} do
    install(root)
    response = conn |> get("/api/scanner/bundle") |> json_response(200)
    assert response["data"]["version"] == "v1"
    assert response["data"]["files"]["arts.json"] == "/api/scanner/bundles/v1/arts.json"
    refute Map.has_key?(response["data"]["files"], "printings.json")

    assert response["data"]["sizes"] == %{
             "arts.json" => 2,
             "detector.onnx" => 1,
             "embed.onnx" => 1,
             "search.onnx" => 1
           }

    file_conn = conn |> recycle() |> get("/api/scanner/bundles/v1/arts.json")
    assert response(file_conn, 200) == "[]"
    assert get_resp_header(file_conn, "content-encoding") == []
    assert get_resp_header(file_conn, "cache-control") == ["private, max-age=31536000, immutable"]
    assert conn |> recycle() |> get("/api/scanner/bundles/v1/unknown.exe") |> json_response(404)
  end

  test "serves gzip and lazily recreates it for an older bundle", %{conn: conn, root: root} do
    install(root)
    gzip_path = Path.join([root, "v1", "arts.json.gz"])
    File.rm!(gzip_path)
    refute File.exists?(gzip_path)

    file_conn =
      conn
      |> put_req_header("accept-encoding", "br, gzip")
      |> get("/api/scanner/bundles/v1/arts.json")

    assert response(file_conn, 200) |> :zlib.gunzip() == "[]"
    assert get_resp_header(file_conn, "content-encoding") == ["gzip"]
    assert get_resp_header(file_conn, "vary") == ["accept-encoding"]
    assert File.regular?(gzip_path)
  end

  defp install(root) do
    files = %{
      "arts.json" => "[]",
      "detector.onnx" => "d",
      "embed.onnx" => "e",
      "search.onnx" => "s"
    }

    manifest = %{
      "version" => "v1",
      "created" => "now",
      "gallery" => %{},
      "constants" => %{},
      "files" =>
        Map.new(files, fn {name, body} ->
          {name,
           %{
             "bytes" => byte_size(body),
             "sha256" => :crypto.hash(:sha256, body) |> Base.encode16(case: :lower)
           }}
        end)
    }

    incoming = Path.join([root, ".incoming", "v1"])
    File.mkdir_p!(incoming)
    Enum.each(files, fn {name, body} -> File.write!(Path.join(incoming, name), body) end)
    File.write!(Path.join(incoming, "manifest.json"), Jason.encode!(manifest))
    File.write!(Path.join(incoming, "SHA256SUMS"), "checksums")
    Bundle.install(manifest, incoming)
  end
end
