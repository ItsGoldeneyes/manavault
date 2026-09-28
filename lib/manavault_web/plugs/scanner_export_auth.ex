defmodule ManavaultWeb.Plugs.ScannerExportAuth do
  @moduledoc """
  Read access to the scanner training corrections: the owner's session, or the read-only
  `SCANNER_CORRECTIONS_TOKEN` (at least 32 characters) that Oracle's importer sends as a
  bearer token.
  """

  import Phoenix.Controller, only: [json: 2]
  import Plug.Conn

  alias ManavaultWeb.Plugs.Authentication

  def init(opts), do: opts

  def call(conn, _opts) do
    if authorized?(conn) do
      put_resp_header(conn, "cache-control", "private, no-store")
    else
      conn
      |> put_status(:unauthorized)
      |> json(%{errors: [%{message: "Authentication required"}]})
      |> halt()
    end
  end

  defp authorized?(conn) do
    case get_req_header(conn, "authorization") do
      [] -> Authentication.authenticated?(conn)
      ["Bearer " <> token] -> valid_token?(token)
      _other -> false
    end
  end

  defp valid_token?(token) do
    expected = Application.get_env(:manavault, :scanner_corrections_token)

    is_binary(expected) and byte_size(expected) >= 32 and
      Plug.Crypto.secure_compare(token, expected)
  end
end
