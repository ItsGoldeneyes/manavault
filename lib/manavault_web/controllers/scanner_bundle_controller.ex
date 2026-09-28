defmodule ManavaultWeb.ScannerBundleController do
  use ManavaultWeb, :controller

  alias Manavault.Scanner.Bundle

  @content_types %{
    "manifest.json" => "application/json",
    "arts.json" => "application/json",
    "printings.json" => "application/json",
    "SHA256SUMS" => "text/plain",
    "detector.onnx" => "application/octet-stream",
    "embed.onnx" => "application/octet-stream",
    "search.onnx" => "application/octet-stream"
  }

  def show(conn, _params) do
    case Bundle.current_manifest() do
      {:ok, manifest} ->
        names = Enum.reject(Bundle.files(), &(&1 == "printings.json"))
        files = Map.new(names, &{&1, ~p"/api/scanner/bundles/#{manifest["version"]}/#{&1}"})

        # Decoded sizes let the browser report download progress even when a file is gzipped.
        sizes =
          for name <- names,
              %{"bytes" => bytes} <- [get_in(manifest, ["files", name])],
              into: %{},
              do: {name, bytes}

        conn
        |> put_resp_header("cache-control", "private, no-cache")
        |> render(:show, manifest: manifest, files: files, sizes: sizes)

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{errors: [%{detail: "Scanner bundle not found"}]})
    end
  end

  def file(conn, %{"version" => version, "name" => name}) do
    case response_file(conn, version, name) do
      {:ok, path} ->
        conn
        |> put_resp_content_type(Map.fetch!(@content_types, name), nil)
        |> put_resp_header("cache-control", "private, max-age=31536000, immutable")
        |> maybe_put_gzip_headers(path)
        |> send_file(200, path)

      {:error, :not_found} ->
        conn
        |> put_status(:not_found)
        |> json(%{errors: [%{detail: "Scanner bundle file not found"}]})
    end
  end

  defp response_file(conn, version, "arts.json") do
    if accepts_gzip?(conn) do
      Bundle.ensure_gzip(version, "arts.json")
    else
      Bundle.file_path(version, "arts.json")
    end
  end

  defp response_file(_conn, version, name), do: Bundle.file_path(version, name)

  defp accepts_gzip?(conn) do
    conn
    |> get_req_header("accept-encoding")
    |> Enum.flat_map(&String.split(&1, ","))
    |> Enum.any?(fn encoding ->
      encoding = String.downcase(String.trim(encoding))

      String.starts_with?(encoding, "gzip") and
        not Regex.match?(~r/(?:^|;)\s*q\s*=\s*0(?:\.0*)?\s*$/, encoding)
    end)
  end

  defp maybe_put_gzip_headers(conn, path) do
    if String.ends_with?(path, ".gz") do
      conn
      |> put_resp_header("content-encoding", "gzip")
      |> put_resp_header("vary", "accept-encoding")
    else
      conn
    end
  end
end
