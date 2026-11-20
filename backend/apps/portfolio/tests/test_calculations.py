from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace

import unittest

from apps.portfolio.calculations import calculate_ledger_states, validate_ledger_balances


class WeightedAverageCostTests(unittest.TestCase):
    def setUp(self):
        self.t1 = datetime(2026, 1, 1, tzinfo=dt_timezone.utc)
        self.t2 = datetime(2026, 1, 2, tzinfo=dt_timezone.utc)
        self.t3 = datetime(2026, 1, 3, tzinfo=dt_timezone.utc)

    def transaction(self, pk, kind, quantity, price, fee, when):
        return SimpleNamespace(
            pk=pk,
            coin_id="bitcoin",
            name="Bitcoin",
            symbol="btc",
            image="",
            transaction_type=kind,
            quantity=Decimal(quantity),
            price=Decimal(price),
            fee=Decimal(fee),
            executed_at=when,
            created_at=when,
        )

    def test_weighted_average_includes_buy_fees_and_sell_fees_reduce_proceeds(self):
        # BUY 1 BTC @ 100 + 1 fee, then BUY 2 BTC @ 130 + 2 fee.
        # Total basis = 363, quantity = 3, weighted average = 121.
        # SELL 1 BTC @ 150 - 1 fee => net proceeds 149, realized P/L = 28.
        transactions = [
            self.transaction("a", "BUY", "1", "100", "1", self.t1),
            self.transaction("b", "BUY", "2", "130", "2", self.t2),
            self.transaction("c", "SELL", "1", "150", "1", self.t3),
        ]
        states, realized = calculate_ledger_states(transactions)
        bitcoin = states["bitcoin"]

        self.assertEqual(bitcoin["quantity"], Decimal("2"))
        self.assertEqual(bitcoin["average_cost"], Decimal("121"))
        self.assertEqual(bitcoin["realized_pnl"], Decimal("28"))
        self.assertIsNone(realized["a"])
        self.assertIsNone(realized["b"])
        self.assertEqual(realized["c"], Decimal("28"))

    def test_calculation_sorts_transactions_chronologically(self):
        transactions = [
            self.transaction("b", "BUY", "1", "120", "0", self.t2),
            self.transaction("a", "BUY", "1", "100", "0", self.t1),
        ]
        states, _ = calculate_ledger_states(transactions)
        self.assertEqual(states["bitcoin"]["quantity"], Decimal("2"))
        self.assertEqual(states["bitcoin"]["average_cost"], Decimal("110"))

    def test_full_sale_resets_remaining_average_cost(self):
        transactions = [
            self.transaction("a", "BUY", "0.5", "100", "0", self.t1),
            self.transaction("b", "SELL", "0.5", "120", "0", self.t2),
        ]
        states, _ = calculate_ledger_states(transactions)
        self.assertEqual(states["bitcoin"]["quantity"], Decimal("0.0"))
        self.assertEqual(states["bitcoin"]["average_cost"], Decimal("0"))
        self.assertEqual(states["bitcoin"]["realized_pnl"], Decimal("10.0"))
    def test_ledger_rejects_sell_that_exceeds_prior_buys(self):
        transactions = [
            self.transaction("a", "BUY", "0.5", "100", "0", self.t1),
            self.transaction("b", "SELL", "0.6", "120", "0", self.t2),
        ]
        with self.assertRaisesRegex(ValueError, "melebihi saldo tersedia"):
            validate_ledger_balances(transactions)

    def test_ledger_allows_sell_up_to_available_quantity(self):
        transactions = [
            self.transaction("a", "BUY", "0.5", "100", "0", self.t1),
            self.transaction("b", "SELL", "0.5", "120", "0", self.t2),
        ]
        validate_ledger_balances(transactions)

