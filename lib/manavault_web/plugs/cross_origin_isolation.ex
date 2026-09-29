defmodule ManavaultWeb.Plugs.CrossOriginIsolation do
  @moduledoc """
  Makes the response's document cross-origin isolated, which is what lets the card scanner
  run onnxruntime's WebAssembly on several threads (`SharedArrayBuffer`).

  Only the scanner page gets these headers. `require-corp` blocks cross-origin images that
  do not opt in, so the scanner page requests card images with `crossorigin`, and the rest of
  the app, which embeds Scryfall, EDHREC and other third-party images plainly, stays
  unaffected. Navigations between the scanner and the rest of the app are full page loads.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    conn
    |> put_resp_header("cross-origin-opener-policy", "same-origin")
    |> put_resp_header("cross-origin-embedder-policy", "require-corp")
  end
end
