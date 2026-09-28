defmodule Manavault.Repo.Migrations.AddIllustrationIdToScryfallPrintings do
  use Ecto.Migration

  def change do
    alter table(:scryfall_printings) do
      add :illustration_id, :string
      add :promo, :boolean, default: false, null: false
    end

    create index(:scryfall_printings, [:illustration_id])
  end
end
