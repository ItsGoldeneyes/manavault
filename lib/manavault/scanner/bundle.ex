defmodule Manavault.Scanner.Bundle do
  @moduledoc "Manages the card scanner model bundle stored on disk."

  @files ~w(manifest.json arts.json detector.onnx embed.onnx search.onnx printings.json SHA256SUMS)
  @required ~w(arts.json detector.onnx embed.onnx search.onnx)
  @version_pattern ~r/\A[A-Za-z0-9][A-Za-z0-9._-]*\z/

  def files, do: @files

  def bundle_dir, do: Application.fetch_env!(:manavault, :scanner_bundle_dir)

  def current_manifest do
    with {:ok, contents} <- File.read(Path.join([bundle_dir(), "current", "manifest.json"])),
         {:ok, %{"version" => version} = manifest} when is_binary(version) <-
           Jason.decode(contents),
         true <- valid_version?(version) do
      {:ok, manifest}
    else
      _error -> {:error, :not_found}
    end
  end

  def file_path(version, name) when is_binary(version) and is_binary(name) do
    path = Path.join([bundle_dir(), version, name])

    if valid_version?(version) and name in @files and File.regular?(path),
      do: {:ok, path},
      else: {:error, :not_found}
  end

  def file_path(_version, _name), do: {:error, :not_found}

  def ensure_gzip(version, "arts.json") when is_binary(version) do
    with {:ok, source} <- file_path(version, "arts.json"), do: ensure_gzip_path(source)
  end

  def ensure_gzip(_version, _name), do: {:error, :not_found}

  @doc "Verifies and atomically activates a bundle directory."
  def install(%{"version" => version} = manifest, incoming_dir) when is_binary(incoming_dir) do
    with true <- valid_version?(version),
         :ok <- validate_manifest(manifest),
         :ok <- verify_files(manifest, incoming_dir),
         {:ok, _gzip_path} <- ensure_gzip_path(Path.join(incoming_dir, "arts.json")),
         :ok <- File.mkdir_p(bundle_dir()),
         {:ok, destination} <- publish_directory(version, incoming_dir),
         :ok <- activate(version),
         :ok <- prune_versions() do
      {:ok, destination}
    else
      false -> {:error, :invalid_version}
      {:error, _reason} = error -> error
    end
  end

  def install(_manifest, _incoming_dir), do: {:error, :invalid_manifest}

  defp ensure_gzip_path(source) do
    gzip_path = source <> ".gz"

    if File.regular?(gzip_path) do
      {:ok, gzip_path}
    else
      temporary = gzip_path <> ".tmp-#{System.unique_integer([:positive, :monotonic])}"

      with {:ok, contents} <- File.read(source),
           :ok <- File.write(temporary, :zlib.gzip(contents), [:binary]),
           :ok <- File.rename(temporary, gzip_path) do
        {:ok, gzip_path}
      else
        {:error, reason} ->
          File.rm(temporary)
          {:error, {:gzip_failed, reason}}
      end
    end
  end

  defp validate_manifest(%{"files" => files}) when is_map(files) do
    if Enum.all?(@required, &Map.has_key?(files, &1)),
      do: :ok,
      else: {:error, :invalid_manifest}
  end

  defp validate_manifest(_manifest), do: {:error, :invalid_manifest}

  defp verify_files(%{"files" => files}, directory) do
    if File.regular?(Path.join(directory, "manifest.json")) and
         File.regular?(Path.join(directory, "SHA256SUMS")) do
      verify_manifest_files(files, directory)
    else
      {:error, :invalid_manifest}
    end
  end

  defp verify_manifest_files(files, directory) do
    Enum.reduce_while(files, :ok, fn
      {name, %{"bytes" => bytes, "sha256" => expected}}, :ok
      when name in @files and name not in ["manifest.json", "SHA256SUMS"] and
             is_integer(bytes) and is_binary(expected) ->
        path = Path.join(directory, name)

        with {:ok, %{size: ^bytes}} <- File.stat(path),
             {:ok, actual} <- file_sha256(path),
             true <- secure_equal?(String.downcase(expected), actual) do
          {:cont, :ok}
        else
          _error -> {:halt, {:error, {:invalid_file, name}}}
        end

      {name, _metadata}, :ok ->
        {:halt, {:error, {:invalid_file, name}}}
    end)
  end

  defp file_sha256(path) do
    hash =
      path
      |> File.stream!(1_048_576, [])
      |> Enum.reduce(:crypto.hash_init(:sha256), &:crypto.hash_update(&2, &1))
      |> :crypto.hash_final()
      |> Base.encode16(case: :lower)

    {:ok, hash}
  rescue
    _error -> {:error, :read_failed}
  end

  defp secure_equal?(left, right) when byte_size(left) == byte_size(right),
    do: Plug.Crypto.secure_compare(left, right)

  defp secure_equal?(_left, _right), do: false

  defp publish_directory(version, incoming_dir) do
    destination = Path.join(bundle_dir(), version)

    case File.rename(incoming_dir, destination) do
      :ok -> {:ok, destination}
      {:error, :eexist} -> {:ok, destination}
      {:error, reason} -> {:error, {:publish_failed, reason}}
    end
  end

  defp activate(version) do
    previous_version = current_version()
    suffix = System.unique_integer([:positive, :monotonic])

    with :ok <- swap_symlink("current", version, suffix),
         do: maybe_swap_previous(previous_version, version, suffix)
  end

  defp maybe_swap_previous(nil, _version, _suffix), do: :ok
  defp maybe_swap_previous(version, version, _suffix), do: :ok

  defp maybe_swap_previous(previous, _version, suffix),
    do: swap_symlink("previous", previous, suffix)

  defp swap_symlink(name, target, suffix) do
    root = bundle_dir()
    temporary = Path.join(root, ".#{name}-#{suffix}")
    final = Path.join(root, name)

    with :ok <- :file.make_symlink(String.to_charlist(target), String.to_charlist(temporary)),
         :ok <- File.rename(temporary, final) do
      :ok
    else
      {:error, :eexist} ->
        File.rm(final)
        File.rename(temporary, final)

      {:error, reason} ->
        File.rm(temporary)
        {:error, {:symlink_failed, reason}}
    end
  end

  defp current_version do
    case current_manifest() do
      {:ok, %{"version" => version}} -> version
      _error -> nil
    end
  end

  defp prune_versions do
    keep = MapSet.new([current_version(), symlink_version("previous")])

    bundle_dir()
    |> File.ls!()
    |> Enum.filter(&valid_version?/1)
    |> Enum.reject(&MapSet.member?(keep, &1))
    |> Enum.each(&File.rm_rf!(Path.join(bundle_dir(), &1)))

    :ok
  end

  defp symlink_version(name) do
    case File.read_link(Path.join(bundle_dir(), name)) do
      {:ok, version} -> version
      _error -> nil
    end
  end

  defp valid_version?(version),
    do: version not in ["current", "previous"] and Regex.match?(@version_pattern, version)
end
