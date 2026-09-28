defmodule Manavault.Scanner.BundleUpdateWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :catalog,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.Scanner.Bundle

  @github_releases "https://api.github.com/repos/cfbender/manavault/releases?per_page=30"

  @impl Oban.Worker
  def perform(_job) do
    case check_for_update() do
      {:ok, :installed} ->
        Logger.info("Scanner bundle update installed")
        :ok

      {:ok, _status} ->
        :ok

      {:error, reason} ->
        Logger.warning("Scanner bundle update failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(15)

  def check_for_update do
    case normalized_source() do
      :off -> {:ok, :disabled}
      :github -> update_from_github()
      {:direct, url} -> update_from_manifest(url, nil)
      :invalid -> {:error, :invalid_source}
    end
  end

  defp normalized_source do
    case Application.get_env(:manavault, :scanner_bundle_source, :github) do
      value when value in [nil, false] ->
        :off

      value when value in [:github, "github"] ->
        :github

      value when is_binary(value) ->
        normalize_string_source(String.trim(value))

      _value ->
        :invalid
    end
  end

  defp normalize_string_source(value) when value in ["", "off", "disabled"], do: :off

  defp normalize_string_source(value) do
    uri = URI.parse(value)

    if uri.scheme in ["http", "https"] and String.ends_with?(uri.path || "", "/manifest.json"),
      do: {:direct, value},
      else: :invalid
  end

  defp update_from_github do
    with {:ok, releases} <- get_json(@github_releases),
         {:ok, %{} = release} <- latest_scanner_release(releases),
         assets <- Map.new(release["assets"] || [], &{&1["name"], &1["browser_download_url"]}),
         manifest_url when is_binary(manifest_url) <- assets["manifest.json"] do
      update_from_manifest(manifest_url, assets)
    else
      # No published scanner release yet is normal for a fresh fork, not a failure to retry.
      {:ok, :no_release} -> {:ok, :no_release}
      nil -> {:error, :manifest_asset_missing}
      {:error, _reason} = error -> error
      _other -> {:error, :invalid_release_response}
    end
  end

  defp latest_scanner_release(releases) when is_list(releases) do
    releases
    |> Enum.filter(fn release ->
      release["draft"] != true and
        String.starts_with?(release["tag_name"] || "", "scanner-bundle-")
    end)
    |> Enum.max_by(&(&1["published_at"] || ""), fn -> nil end)
    |> case do
      nil -> {:ok, :no_release}
      release -> {:ok, release}
    end
  end

  defp latest_scanner_release(_releases), do: {:error, :invalid_release_response}

  defp update_from_manifest(url, assets) do
    with {:ok, manifest} <- get_json(url),
         %{"version" => version, "files" => files} when is_binary(version) and is_map(files) <-
           manifest do
      if current_version() == version do
        {:ok, :current}
      else
        download_and_install(url, assets, manifest)
      end
    else
      {:error, _reason} = error -> error
      _other -> {:error, :invalid_manifest}
    end
  end

  defp download_and_install(
         manifest_url,
         assets,
         %{"version" => version, "files" => files} = manifest
       ) do
    incoming =
      Path.join([
        Bundle.bundle_dir(),
        ".incoming",
        "#{version}-#{System.unique_integer([:positive, :monotonic])}"
      ])

    try do
      with :ok <- File.mkdir_p(incoming),
           :ok <- File.write(Path.join(incoming, "manifest.json"), Jason.encode!(manifest)),
           :ok <-
             download_files(Map.keys(files) ++ ["SHA256SUMS"], manifest_url, assets, incoming),
           {:ok, _path} <- Bundle.install(manifest, incoming) do
        {:ok, :installed}
      end
    after
      File.rm_rf(incoming)
    end
  end

  defp download_files(names, manifest_url, assets, incoming) do
    Enum.reduce_while(names, :ok, fn name, :ok ->
      url = if assets, do: assets[name], else: URI.merge(manifest_url, name) |> URI.to_string()

      case url && download(url, Path.join(incoming, name)) do
        :ok -> {:cont, :ok}
        nil -> {:halt, {:error, {:asset_missing, name}}}
        {:error, reason} -> {:halt, {:error, {:download_failed, name, reason}}}
      end
    end)
  end

  defp get_json(url) do
    case Req.get(url, request_options()) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_map(body) ->
        {:ok, body}

      {:ok, %{status: status, body: body}} when status in 200..299 and is_list(body) ->
        {:ok, body}

      {:ok, %{status: status, body: body}} when status in 200..299 and is_binary(body) ->
        Jason.decode(body)

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp download(url, destination) do
    stream = File.stream!(destination, 1_048_576, [:write])

    case Req.get(url, request_options(into: stream)) do
      {:ok, %{status: status}} when status in 200..299 -> :ok
      {:ok, %{status: status}} -> {:error, {:http_error, status}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp request_options(extra \\ []) do
    [
      redirect: true,
      max_redirects: 5,
      retry: false,
      receive_timeout: :timer.minutes(5),
      headers: [{"user-agent", "ManaVault scanner bundle updater"}]
    ]
    |> Keyword.merge(Application.get_env(:manavault, :scanner_bundle_req_options, []))
    |> Keyword.merge(extra)
  end

  defp current_version do
    case Bundle.current_manifest() do
      {:ok, %{"version" => version}} -> version
      _error -> nil
    end
  end
end
