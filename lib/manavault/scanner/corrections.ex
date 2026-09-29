defmodule Manavault.Scanner.Corrections do
  @moduledoc """
  Labelled scanner frames for training card recognition, collected when "Collect training
  data" is on. The layout and export match The Gathering's corrections so Oracle's
  `cardid.corrections pull` imports them unchanged:

      DATA_DIR/scanner/corrections/labels.jsonl        append-only; the last row per capture wins
      DATA_DIR/scanner/corrections/<capture_id>/crop.jpg
      DATA_DIR/scanner/corrections/<capture_id>/label.json

  A relabel (a changed printing or finish) may omit the image once the capture exists; the
  first image is never overwritten. An outline check resubmits the capture with the corrected
  `quad` and `quad_source: "manual"`, which Oracle trusts for detector training. A `null`
  label marks the capture skipped (the scan was deleted, so its label is not trusted);
  Oracle's importer treats the latest row as final. Writes are serialized; repeated
  submissions are idempotent.
  """

  alias Manavault.Scanner.Bundle

  @uuid ~r/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
  # Gallery IDs name a printed face `<uuid>-1`; Oracle accepts only that suffix.
  @printing_id ~r/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-1)?\z/
  @fields ~w(capture_id label click quad quad_source up_vote bundle_version top1 similarity margin finish)
  @finishes ~w(nonfoil foil etched)
  # `manual`: a person confirmed or drew the outline, so Oracle may train the detector on it.
  @quad_sources ~w(detector manual)
  @max_image 190_000
  @page_size 50

  def directory, do: Path.join(Bundle.bundle_dir(), "corrections")

  def save(params) when is_map(params) do
    with :ok <- validate_fields(params),
         {:ok, jpeg} <- image(params) do
      :global.trans({__MODULE__, self()}, fn -> persist(params, jpeg) end)
    end
  end

  def save(_params), do: {:error, :bad_request}

  def page(cursor) when is_integer(cursor) and cursor >= 0 do
    rows = labels() |> Stream.drop(cursor) |> Enum.take(@page_size)
    %{corrections: rows, cursor: cursor + length(rows), has_more: length(rows) == @page_size}
  end

  def crop_path(id) do
    path = Path.join([directory(), to_string(id), "crop.jpg"])
    if uuid?(id) and File.regular?(path), do: {:ok, path}, else: {:error, :not_found}
  end

  defp validate_fields(p) do
    if uuid?(p["capture_id"]) and (is_nil(p["label"]) or printing_id?(p["label"])) and
         point?(p["click"], 0, 640) and
         quad?(p["quad"]) and quad_source?(p["quad_source"], p["quad"]) and
         optional_number?(p["up_vote"], 0, 2) and
         optional_number?(p["similarity"], -2, 2) and optional_number?(p["margin"], 0, 4) and
         (is_nil(p["top1"]) or printing_id?(p["top1"])) and
         (is_nil(p["finish"]) or p["finish"] in @finishes) and
         is_binary(p["bundle_version"]) and byte_size(p["bundle_version"]) <= 120,
       do: :ok,
       else: {:error, :bad_request}
  end

  defp image(%{"image" => "data:image/jpeg;base64," <> encoded} = p)
       when byte_size(encoded) <= @max_image do
    with {:ok, <<255, 216, rest::binary>> = jpeg} <- Base.decode64(encoded),
         true <- :binary.part(jpeg, byte_size(jpeg) - 2, 2) == <<255, 217>>,
         {width, height} <- jpeg_size(rest),
         [x, y] <- p["click"],
         true <- width in 1..640 and height in 1..640 and x <= width and y <= height do
      {:ok, jpeg}
    else
      _ -> {:error, :bad_request}
    end
  end

  defp image(%{"image" => _image}), do: {:error, :bad_request}

  defp image(%{"capture_id" => id}) do
    if File.regular?(Path.join([directory(), id, "crop.jpg"])),
      do: {:ok, nil},
      else: {:error, :bad_request}
  end

  defp uuid?(id), do: is_binary(id) and Regex.match?(@uuid, id)
  defp printing_id?(id), do: is_binary(id) and Regex.match?(@printing_id, id)
  defp number?(n, low, high), do: is_number(n) and n >= low and n <= high
  defp optional_number?(nil, _low, _high), do: true
  defp optional_number?(n, low, high), do: number?(n, low, high)
  defp point?([x, y], low, high), do: number?(x, low, high) and number?(y, low, high)
  defp point?(_point, _low, _high), do: false
  defp quad?(nil), do: true

  defp quad?(q) when is_list(q),
    do: length(q) == 4 and Enum.all?(q, &point?(&1, -2048, 2048))

  defp quad?(_quad), do: false

  defp quad_source?(nil, _quad), do: true
  defp quad_source?("manual", nil), do: false
  defp quad_source?(source, _quad), do: source in @quad_sources

  # Baseline/progressive JPEG frame dimensions without decoding pixels; Oracle's importer
  # validates the image fully.
  defp jpeg_size(<<255, marker, _length::16, 8, height::16, width::16, _rest::binary>>)
       when marker in [192, 194],
       do: {width, height}

  defp jpeg_size(<<255, marker, length::16, rest::binary>>)
       when marker not in [216, 217, 218] and length >= 2 and byte_size(rest) >= length - 2 do
    rest |> binary_part(length - 2, byte_size(rest) - length + 2) |> jpeg_size()
  end

  defp jpeg_size(_data), do: :invalid

  defp persist(params, jpeg) do
    id = params["capture_id"]
    dir = Path.join(directory(), id)

    row =
      params
      |> Map.take(@fields)
      # Absent optional fields are dropped, but a skip keeps `"label": null` (Oracle's format).
      |> Map.reject(fn {key, value} -> is_nil(value) and key != "label" end)
      |> Map.put_new("label", nil)
      |> Map.put("split", split_for(id))
      |> Map.put("source", "manavault-scanner")

    encoded = Jason.encode!(row)
    latest_path = Path.join(dir, "label.json")

    if File.read(latest_path) != {:ok, encoded} do
      File.mkdir_p!(dir)
      crop = Path.join(dir, "crop.jpg")
      if jpeg && !File.exists?(crop), do: File.write!(crop, jpeg)
      File.write!(Path.join(directory(), "labels.jsonl"), encoded <> "\n", [:append])
      File.write!(latest_path, encoded)
    end

    {:ok, %{capture_id: id}}
  end

  # Same deterministic 1-in-5 held-out split as Oracle's importer.
  defp split_for(id) do
    hash = :crypto.hash(:sha, id) |> :binary.decode_unsigned()
    if rem(hash, 5) == 0, do: "eval", else: "train"
  end

  defp labels do
    path = Path.join(directory(), "labels.jsonl")

    if File.exists?(path),
      do: path |> File.stream!() |> Stream.map(&Jason.decode!/1),
      else: []
  end
end
