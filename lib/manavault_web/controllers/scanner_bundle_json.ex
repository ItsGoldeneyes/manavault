defmodule ManavaultWeb.ScannerBundleJSON do
  def show(%{manifest: manifest, files: files, sizes: sizes}) do
    %{
      data: %{
        version: manifest["version"],
        created: manifest["created"],
        gallery: manifest["gallery"],
        constants: manifest["constants"],
        files: files,
        sizes: sizes
      }
    }
  end
end
