defmodule Manavault.Catalog.CommanderRulesTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.Card
  alias Manavault.Catalog.CommanderRules

  defp card(type_line, oracle_text \\ nil) do
    %Card{name: "Test Card", type_line: type_line, oracle_text: oracle_text}
  end

  describe "can_be_commander?/1" do
    test "accepts legendary creatures" do
      assert CommanderRules.can_be_commander?(card("Legendary Creature — Cat"))
      assert CommanderRules.can_be_commander?(card("Legendary Artifact Creature — Golem"))
    end

    test "accepts cards whose text says they can be your commander" do
      assert CommanderRules.can_be_commander?(
               card(
                 "Legendary Planeswalker — Jace",
                 "Jace, Multiverse Architect can be your commander.\n+1: Draw a card."
               )
             )

      assert CommanderRules.can_be_commander?(
               card(
                 "Legendary Enchantment",
                 "Ashaya's Enduring Bond can be your commander."
               )
             )
    end

    test "accepts legendary Vehicles and Spacecraft" do
      assert CommanderRules.can_be_commander?(card("Legendary Artifact — Vehicle"))
      assert CommanderRules.can_be_commander?(card("Legendary Artifact — Spacecraft"))
    end

    test "rejects non-legendary creatures and legendary non-creatures" do
      refute CommanderRules.can_be_commander?(card("Creature — Cat"))
      refute CommanderRules.can_be_commander?(card("Legendary Planeswalker — Jace", "+1: Draw."))
      refute CommanderRules.can_be_commander?(card("Legendary Enchantment — Background"))
      refute CommanderRules.can_be_commander?(card("Legendary Artifact — Equipment"))
    end

    test "judges the type line by the front face" do
      assert CommanderRules.can_be_commander?(
               card("Legendary Creature — God // Legendary Enchantment")
             )

      refute CommanderRules.can_be_commander?(
               card("Legendary Enchantment — Saga // Legendary Creature — Snake")
             )
    end

    test "rejects text that merely mentions commanders" do
      refute CommanderRules.can_be_commander?(
               card("Sorcery", "Return your commander to your hand. Vehicles can crew.")
             )
    end

    test "handles missing data" do
      refute CommanderRules.can_be_commander?(card(nil))
      refute CommanderRules.can_be_commander?(nil)
    end
  end
end
