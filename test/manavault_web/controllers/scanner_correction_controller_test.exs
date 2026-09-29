defmodule ManavaultWeb.ScannerCorrectionControllerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Scanner.Corrections

  @capture "11111111-2222-4333-8444-555555555555"
  @label "54772e15-d99d-4eec-ba8d-b9202a7e318b"
  @token String.duplicate("t", 40)

  setup do
    root =
      Path.join(System.tmp_dir!(), "scanner-corrections-#{System.unique_integer([:positive])}")

    previous_dir = Application.get_env(:manavault, :scanner_bundle_dir)
    previous_token = Application.get_env(:manavault, :scanner_corrections_token)
    Application.put_env(:manavault, :scanner_bundle_dir, root)
    Application.put_env(:manavault, :scanner_corrections_token, @token)

    on_exit(fn ->
      Application.put_env(:manavault, :scanner_bundle_dir, previous_dir)
      Application.put_env(:manavault, :scanner_corrections_token, previous_token)
      File.rm_rf!(root)
    end)

    :ok
  end

  defp payload(overrides \\ %{}) do
    jpeg = File.read!("test/support/fixtures/scanner-frame.jpg")

    Map.merge(
      %{
        "capture_id" => @capture,
        "label" => @label,
        "top1" => @label,
        "click" => [32, 32],
        "quad" => [[4, 4], [60, 4], [60, 60], [4, 60]],
        "up_vote" => 1.0,
        "similarity" => 0.91,
        "margin" => 0.3,
        "finish" => "foil",
        "bundle_version" => "retrain-20260925T043526910942Z",
        "image" => "data:image/jpeg;base64," <> Base.encode64(jpeg)
      },
      overrides
    )
  end

  test "stores a labelled frame in Oracle's corrections layout", %{conn: conn} do
    assert %{"data" => %{"capture_id" => @capture}} =
             conn |> post("/api/scanner/corrections", payload()) |> json_response(201)

    dir = Path.join(Corrections.directory(), @capture)

    assert File.read!(Path.join(dir, "crop.jpg")) ==
             File.read!("test/support/fixtures/scanner-frame.jpg")

    assert [row] = Corrections.page(0).corrections
    assert row["label"] == @label
    assert row["source"] == "manavault-scanner"
    assert row["finish"] == "foil"
    assert row["split"] in ["train", "eval"]
    refute Map.has_key?(row, "image")
  end

  test "a relabel may omit the image and keeps the first crop", %{conn: conn} do
    conn |> post("/api/scanner/corrections", payload()) |> json_response(201)
    other = "db6358cf-fcb9-42af-9755-dd1f39bfc8ff"

    conn
    |> recycle()
    |> post("/api/scanner/corrections", payload(%{"label" => other}) |> Map.delete("image"))
    |> json_response(201)

    # Identical resubmissions are not appended again.
    conn
    |> recycle()
    |> post("/api/scanner/corrections", payload(%{"label" => other}) |> Map.delete("image"))
    |> json_response(201)

    assert Enum.map(Corrections.page(0).corrections, & &1["label"]) == [@label, other]
  end

  test "a checked outline resubmits the capture with a manual quad source", %{conn: conn} do
    conn |> post("/api/scanner/corrections", payload()) |> json_response(201)
    drawn = [[5, 3], [61, 5], [59, 61], [3, 59]]

    conn
    |> recycle()
    |> post(
      "/api/scanner/corrections",
      payload(%{"quad" => drawn, "quad_source" => "manual"}) |> Map.delete("image")
    )
    |> json_response(201)

    assert [first, checked] = Corrections.page(0).corrections
    refute Map.has_key?(first, "quad_source")
    assert checked["quad"] == drawn
    assert checked["quad_source"] == "manual"
  end

  test "a null label marks the capture skipped", %{conn: conn} do
    conn |> post("/api/scanner/corrections", payload()) |> json_response(201)

    conn
    |> recycle()
    |> post("/api/scanner/corrections", payload(%{"label" => nil}) |> Map.delete("image"))
    |> json_response(201)

    assert [_first, skipped] = Corrections.page(0).corrections
    assert Map.fetch(skipped, "label") == {:ok, nil}
  end

  test "rejects malformed corrections and image-less new captures", %{conn: conn} do
    for bad <- [
          payload(%{"label" => "not-a-uuid"}),
          payload(%{"click" => [900, 10]}),
          payload(%{"finish" => "shiny"}),
          payload(%{"quad_source" => "guessed"}),
          payload(%{"quad_source" => "manual", "quad" => nil}),
          payload(%{"image" => "data:image/jpeg;base64,bm90IGEganBlZw=="}),
          Map.delete(payload(), "image")
        ] do
      assert conn |> recycle() |> post("/api/scanner/corrections", bad) |> json_response(400)
    end

    assert Corrections.page(0).corrections == []
  end

  test "exports pages and crops with the bearer token only when auth is on", %{conn: conn} do
    conn |> post("/api/scanner/corrections", payload()) |> json_response(201)
    Application.put_env(:manavault, :auth_disabled, false)
    on_exit(fn -> Application.put_env(:manavault, :auth_disabled, true) end)

    assert build_conn() |> get("/api/scanner/corrections") |> json_response(401)

    assert %{"errors" => [%{"message" => "Invalid scanner corrections token"}]} =
             build_conn()
             |> put_req_header("authorization", "Bearer wrong")
             |> get("/api/scanner/corrections")
             |> json_response(401)

    Application.put_env(:manavault, :scanner_corrections_token, nil)

    assert %{"errors" => [%{"message" => "Token export is disabled" <> _rest}]} =
             build_conn()
             |> put_req_header("authorization", "Bearer " <> @token)
             |> get("/api/scanner/corrections")
             |> json_response(401)

    Application.put_env(:manavault, :scanner_corrections_token, @token)

    authed = fn -> put_req_header(build_conn(), "authorization", "Bearer " <> @token) end

    assert %{"data" => %{"corrections" => [row], "cursor" => 1, "has_more" => false}} =
             authed.() |> get("/api/scanner/corrections") |> json_response(200)

    assert row["capture_id"] == @capture

    crop = authed.() |> get("/api/scanner/corrections/#{@capture}/crop")
    assert response(crop, 200) == File.read!("test/support/fixtures/scanner-frame.jpg")
    assert get_resp_header(crop, "cache-control") == ["private, no-store"]
    assert authed.() |> get("/api/scanner/corrections?cursor=-1") |> json_response(400)
    assert authed.() |> get("/api/scanner/corrections/../crop") |> response(404)
  end
end
