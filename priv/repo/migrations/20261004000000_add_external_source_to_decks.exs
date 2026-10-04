defmodule Manavault.Repo.Migrations.AddExternalSourceToDecks do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :external_source, :string
      add :external_id, :string
      add :external_url, :string
      add :external_synced_at, :utc_datetime
      add :external_sync_error, :string
    end

    create index(:decks, [:external_source])
  end
end
