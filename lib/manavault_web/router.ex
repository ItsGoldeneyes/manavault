defmodule ManavaultWeb.Router do
  use ManavaultWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug ManavaultWeb.Plugs.ContentSecurityPolicy
  end

  pipeline :authenticated_browser do
    plug ManavaultWeb.Plugs.Authentication, :browser
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
  end

  pipeline :authenticated_api do
    plug ManavaultWeb.Plugs.Authentication, :api
    plug ManavaultWeb.Plugs.GraphQLCSRFProtection
  end

  # Read-only JSON/file endpoints for the signed-in owner. GETs carry no CSRF risk, so the
  # GraphQL CSRF plug (POST-only) is not part of this stack.
  pipeline :authenticated_read_api do
    plug ManavaultWeb.Plugs.Authentication, :api
  end

  pipeline :personal_api do
    plug ManavaultWeb.Plugs.ApiKeyAuthentication
  end

  pipeline :public_graphql do
    plug ManavaultWeb.Plugs.PublicGraphQLProtection, :validate
  end

  scope "/", ManavaultWeb do
    get "/site.webmanifest", PwaController, :manifest
    get "/sw.js", PwaController, :service_worker
    get "/.well-known/assetlinks.json", PwaController, :asset_links
    get "/share/decks/:token/preview.svg", AppController, :share_deck_preview_image
    get "/share/decks/:token/preview.png", AppController, :share_deck_preview_png
  end

  scope "/", ManavaultWeb do
    pipe_through :browser

    get "/login", AuthController, :new
    post "/login", AuthController, :create
    get "/share/decks/:token", AppController, :share_deck
    get "/share/wants/:token", AppController, :share_wants
    get "/share/binder/:token", AppController, :share_binder
    get "/scryfall-assets/*path", ScryfallAssetController, :show
    post "/vendors/star-city-games/deck-builder", VendorController, :star_city_games
  end

  scope "/", ManavaultWeb do
    pipe_through [:browser, :authenticated_browser]

    get "/", AppController, :index
    get "/settings", AppController, :index
    get "/cards", AppController, :index
    get "/cards/:id", AppController, :index
    get "/decks", AppController, :index
    get "/decks/:id", AppController, :index
    get "/decks/:id/playtest", AppController, :index
    get "/collection", AppController, :index
    get "/collection/new", AppController, :index
    get "/collection/locations/:id", AppController, :index
    get "/collection/:id/edit", AppController, :index
    get "/trade", AppController, :index
    get "/scan", AppController, :index
    post "/logout", AuthController, :delete
  end

  scope "/" do
    pipe_through [:api, :public_graphql]

    forward "/share/graphql", Absinthe.Plug,
      schema: ManavaultWeb.PublicShareSchema,
      analyze_complexity: true,
      max_complexity: 100_000,
      token_limit: 5_000,
      pipeline: {ManavaultWeb.Plugs.PublicGraphQLProtection, :pipeline}
  end

  scope "/" do
    pipe_through :api

    get "/health", ManavaultWeb.HealthController, :show
  end

  scope "/api/v1", ManavaultWeb.Api.V1 do
    pipe_through [:api, :personal_api]

    get "/decks", DeckController, :index
  end

  scope "/" do
    pipe_through [:api, :authenticated_api]

    forward "/api/graphql", Absinthe.Plug, schema: ManavaultWeb.Schema
  end

  scope "/api/scanner", ManavaultWeb do
    pipe_through [:api, :authenticated_read_api]

    get "/bundle", ScannerBundleController, :show
    get "/bundles/:version/:name", ScannerBundleController, :file
  end

  # Other scopes may use custom stacks.
  # scope "/api", ManavaultWeb do
  #   pipe_through :api
  # end

  # Enable Swoosh mailbox preview in development.
  if Application.compile_env(:manavault, :dev_routes) do
    scope "/dev" do
      pipe_through :browser

      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
