defmodule Manavault.Repo.Migrations.AddSwapThreadToDeckQuestionAnswers do
  use Ecto.Migration

  def change do
    alter table(:deck_question_answers) do
      add :thread_id, :string
      add :swap_context, :map
    end

    create index(:deck_question_answers, [:deck_id, :thread_id])
  end
end
