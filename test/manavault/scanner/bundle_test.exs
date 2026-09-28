defmodule Manavault.Scanner.BundleTest do
  use ExUnit.Case

  alias Manavault.Scanner.Bundle

  setup do
    root = Path.join(System.tmp_dir!(), "scanner-bundle-#{System.unique_integer([:positive])}")
    previous = Application.get_env(:manavault, :scanner_bundle_dir)
    Application.put_env(:manavault, :scanner_bundle_dir, root)

    on_exit(fn ->
      Application.put_env(:manavault, :scanner_bundle_dir, previous)
      File.rm_rf!(root)
    end)

    {:ok, root: root}
  end

  test "rejects a checksum mismatch", %{root: root} do
    {manifest, incoming} = bundle(root, "v1", %{"arts.json" => "tampered"})
    assert {:error, {:invalid_file, "arts.json"}} = Bundle.install(manifest, incoming)
    assert {:error, :not_found} = Bundle.current_manifest()
  end

  test "swaps current, keeps previous, and prunes older versions", %{root: root} do
    Enum.each(~w(v1 v2 v3), fn version ->
      {manifest, incoming} = bundle(root, version)
      assert {:ok, _path} = Bundle.install(manifest, incoming)
    end)

    assert {:ok, %{"version" => "v3"}} = Bundle.current_manifest()
    assert {:ok, "v3"} = File.read_link(Path.join(root, "current"))
    assert {:ok, "v2"} = File.read_link(Path.join(root, "previous"))
    refute File.exists?(Path.join(root, "v1"))
  end

  test "creates a compressed arts file during installation", %{root: root} do
    {manifest, incoming} = bundle(root, "v1")
    assert {:ok, _path} = Bundle.install(manifest, incoming)
    assert {:ok, gzip_path} = Bundle.ensure_gzip("v1", "arts.json")
    assert File.read!(gzip_path) |> :zlib.gunzip() == "[]"
    assert {:error, :not_found} = Bundle.file_path("v1", "arts.json.gz")
  end

  defp bundle(root, version, overrides \\ %{}) do
    files =
      Map.merge(
        %{
          "arts.json" => "[]",
          "detector.onnx" => "detector",
          "embed.onnx" => "embed",
          "search.onnx" => "search"
        },
        overrides
      )

    manifest = %{
      "version" => version,
      "created" => "now",
      "gallery" => %{},
      "constants" => %{},
      "files" =>
        Map.new(files, fn {name, body} ->
          {name, %{"bytes" => byte_size(body), "sha256" => sha(body)}}
        end)
    }

    incoming = Path.join([root, ".incoming", "#{version}-test"])
    File.mkdir_p!(incoming)

    Enum.each(files, fn {name, body} ->
      File.write!(
        Path.join(incoming, name),
        if(name == "arts.json" and overrides != %{}, do: "bad", else: body)
      )
    end)

    File.write!(Path.join(incoming, "manifest.json"), Jason.encode!(manifest))
    File.write!(Path.join(incoming, "SHA256SUMS"), "checksums")
    {manifest, incoming}
  end

  defp sha(body), do: :crypto.hash(:sha256, body) |> Base.encode16(case: :lower)
end
