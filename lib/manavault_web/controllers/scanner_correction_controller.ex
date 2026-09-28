defmodule ManavaultWeb.ScannerCorrectionController do
  use ManavaultWeb, :controller

  alias Manavault.Scanner.Corrections

  def create(conn, params) do
    case Corrections.save(params) do
      {:ok, correction} ->
        conn |> put_status(:created) |> json(%{data: correction})

      {:error, :bad_request} ->
        conn |> put_status(:bad_request) |> json(%{errors: [%{message: "Invalid correction"}]})
    end
  end

  def index(conn, params) do
    with value when is_binary(value) <- Map.get(params, "cursor", "0"),
         {cursor, ""} when cursor >= 0 <- Integer.parse(value) do
      json(conn, %{data: Corrections.page(cursor)})
    else
      _invalid ->
        conn |> put_status(:bad_request) |> json(%{errors: [%{message: "Invalid cursor"}]})
    end
  end

  def crop(conn, %{"id" => id}) do
    case Corrections.crop_path(id) do
      {:ok, path} ->
        conn
        |> put_resp_content_type("image/jpeg", nil)
        |> send_file(200, path)

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{errors: [%{message: "Not found"}]})
    end
  end
end
