defmodule Manavault.Repo.Migrations.AddConversationIdToDeckQuestionAnswers do
  use Ecto.Migration

  def change do
    alter table(:deck_question_answers) do
      add :conversation_id, :string
    end

    create index(:deck_question_answers, [:deck_id, :conversation_id])
  end
end
