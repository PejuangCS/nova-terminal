import unittest
from decimal import Decimal

from apps.alerts.rules import price_matches_condition


class PriceAlertRuleTests(unittest.TestCase):
    def test_above_triggers_at_target(self):
        self.assertTrue(price_matches_condition("ABOVE", Decimal("100"), Decimal("100")))

    def test_above_triggers_above_target(self):
        self.assertTrue(price_matches_condition("ABOVE", Decimal("101"), Decimal("100")))

    def test_above_does_not_trigger_below_target(self):
        self.assertFalse(price_matches_condition("ABOVE", Decimal("99.99"), Decimal("100")))

    def test_below_triggers_at_target(self):
        self.assertTrue(price_matches_condition("BELOW", Decimal("100"), Decimal("100")))

    def test_below_triggers_below_target(self):
        self.assertTrue(price_matches_condition("BELOW", Decimal("99"), Decimal("100")))

    def test_below_does_not_trigger_above_target(self):
        self.assertFalse(price_matches_condition("BELOW", Decimal("100.01"), Decimal("100")))

    def test_unknown_condition_is_rejected(self):
        with self.assertRaises(ValueError):
            price_matches_condition("SIDEWAYS", Decimal("100"), Decimal("100"))


if __name__ == "__main__":
    unittest.main()
