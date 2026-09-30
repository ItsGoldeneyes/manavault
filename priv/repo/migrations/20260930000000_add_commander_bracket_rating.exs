defmodule Manavault.Repo.Migrations.AddCommanderBracketRating do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :commander_bracket_rating, :text
    end

    alter table(:deck_analysis_requests) do
      add :commander_bracket_rating, :text
    end
  end
end
