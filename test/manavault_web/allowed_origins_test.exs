defmodule ManavaultWeb.AllowedOriginsTest do
  use ExUnit.Case, async: true

  import ExUnit.CaptureLog
  import Plug.Conn
  import Plug.Test

  alias ManavaultWeb.AllowedOrigins
  alias Phoenix.Socket.Transport

  @host "manavault.example.com"

  describe "check_origin/2" do
    test "returns nil when unset or blank so Phoenix keeps its default" do
      assert AllowedOrigins.check_origin(@host, nil) == nil
      assert AllowedOrigins.check_origin(@host, "") == nil
      assert AllowedOrigins.check_origin(@host, " , ,  ") == nil
    end

    test "always allows PHX_HOST ahead of the extra origins" do
      assert AllowedOrigins.check_origin(@host, "https://manavault.mytailnet.ts.net") == [
               "//manavault.example.com",
               "https://manavault.mytailnet.ts.net"
             ]
    end
  end

  describe "parse/1" do
    test "parses one origin" do
      assert AllowedOrigins.parse("https://manavault.mytailnet.ts.net") == [
               "https://manavault.mytailnet.ts.net"
             ]
    end

    test "parses several origins, keeping ports" do
      assert AllowedOrigins.parse("https://manavault.mytailnet.ts.net,http://manavault.lan:4000") ==
               ["https://manavault.mytailnet.ts.net", "http://manavault.lan:4000"]
    end

    test "trims whitespace and trailing slashes, lowercases, and drops duplicates" do
      assert AllowedOrigins.parse(
               "  https://Manavault.mytailnet.ts.net/ ,, https://manavault.mytailnet.ts.net ,http://manavault.lan/ "
             ) == ["https://manavault.mytailnet.ts.net", "http://manavault.lan"]
    end

    test "raises on entries that are not http(s) origins" do
      for invalid <- [
            "manavault.lan",
            "manavault.lan:4000",
            "ftp://manavault.lan",
            "https://",
            "https://manavault.lan/app",
            "https://manavault.lan?x=1",
            "https://user@manavault.lan",
            "https://manavault.lan:port",
            "not a url"
          ] do
        assert_raise ArgumentError, ~r/MANAVAULT_ALLOWED_ORIGINS has an invalid entry/, fn ->
          AllowedOrigins.parse("https://manavault.mytailnet.ts.net," <> invalid)
        end
      end
    end
  end

  describe "with Phoenix's socket origin check" do
    setup do
      [check_origin: AllowedOrigins.check_origin(@host, "https://manavault.mytailnet.ts.net")]
    end

    test "accepts PHX_HOST and each listed origin", %{check_origin: check_origin} do
      for origin <- [
            "https://manavault.example.com",
            "http://manavault.example.com:4000",
            "https://manavault.mytailnet.ts.net"
          ] do
        refute socket_conn(origin, check_origin).halted, "expected #{origin} to be allowed"
      end
    end

    test "rejects unlisted origins", %{check_origin: check_origin} do
      for origin <- [
            "https://evil.example.net",
            "http://manavault.mytailnet.ts.net",
            "https://manavault.mytailnet.ts.net:8443"
          ] do
        capture_log(fn ->
          conn = socket_conn(origin, check_origin)
          assert conn.halted, "expected #{origin} to be rejected"
          assert conn.status == 403
        end)
      end
    end
  end

  defp socket_conn(origin, check_origin) do
    conn(:get, "/socket/websocket")
    |> put_req_header("origin", origin)
    |> Transport.check_origin(ManavaultWeb.UserSocket, ManavaultWeb.Endpoint,
      check_origin: check_origin
    )
  end
end
