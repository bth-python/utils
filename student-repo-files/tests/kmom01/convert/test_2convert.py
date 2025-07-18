#!/usr/bin/env python3
"""
Contains testcases for the individual examination.
"""

import os
import sys
import unittest
from io import StringIO
from unittest import TextTestRunner
from unittest.mock import patch

from tester import ExamTestCase, ExamTestResult, find_path_to_assignment, import_module, tags

FILE_DIR = os.path.dirname(os.path.realpath(__file__))
REPO_PATH = find_path_to_assignment(FILE_DIR)


if REPO_PATH not in sys.path:
    sys.path.insert(0, REPO_PATH)

# Path to file and basename of the file to import
# convert = import_module(REPO_PATH, "convert") # Has inputs, use in check_print


class Test2Convert(ExamTestCase):
    """
    Each assignment has 1 testcase with multiple asserts.
    The different asserts https://docs.python.org/3.6/library/unittest.html#test-cases
    """

    link_to_assignment = "https://dbwebb-python-bth.github.io/website/laromaterial/uppgift/convert/"

    @classmethod
    def setUpClass(cls):
        """
        To find all relative files that are read or written to.
        """
        os.chdir(REPO_PATH)

    def get_output_from_program(self, inp):
        """
        One function for testing print input functions
        """
        with patch("builtins.input", side_effect=inp):
            with patch("sys.stdout", new=StringIO()) as fake_out:
                import_module(REPO_PATH, "convert")
                return fake_out.getvalue()

    @tags("speed", "s", "S")
    def test_a_speed_example(self):
        """
        Testar kilometer till miles med heltal som input.
        Använder följande som input:
        {arguments}
        Förväntar att följande finns med i utskrift:
        {correct}
        Fick följande:
        {student}
        """
        self.norepr = True
        self._multi_arguments = [80, "S"]
        output_from_program = self.get_output_from_program(self._multi_arguments)
        self.assertIn("80.0 ", output_from_program)
        self.assertIn("49.71 ", output_from_program)

    @tags("speed", "s", "S")
    def test_b_speed_float_value(self):
        """
        Testar kilometer till miles med decimaltal som input.
        Använder följande som input:
        {arguments}
        Förväntar att följande finns med i utskrift:
        {correct}
        Fick följande:
        {student}
        """
        self.norepr = True
        self._multi_arguments = [555.54, "S"]
        output_from_program = self.get_output_from_program(self._multi_arguments)
        self.assertIn("555.54 ", output_from_program)
        self.assertIn("345.2 ", output_from_program)

    @tags("price", "p", "P")
    def test_c_price_example(self):
        """
        Testar räkna ut pris efter rabatt med heltal som input.
        Använder följande som input:
        {arguments}
        Förväntar att följande finns med i utskrift:
        {correct}
        Fick följande:
        {student}
        """
        self.norepr = True
        self._multi_arguments = [100, "P"]
        output_from_program = self.get_output_from_program(self._multi_arguments)
        self.assertIn("100.0 ", output_from_program)
        self.assertIn("108.0 ", output_from_program)

    @tags("price", "p", "P")
    def test_d_price_float_value(self):
        """
        Testar räkna ut pris efter rabatt med decimaltal som input.
        Använder följande som input:
        {arguments}
        Förväntar att följande finns med i utskrift:
        {correct}
        Fick följande:
        {student}
        """
        self.norepr = True
        self._multi_arguments = [100, "P"]
        output_from_program = self.get_output_from_program(self._multi_arguments)
        self.assertIn("100.0 ", output_from_program)
        self.assertIn("108.0 ", output_from_program)


if __name__ == "__main__":
    runner = TextTestRunner(resultclass=ExamTestResult, verbosity=2)
    unittest.main(testRunner=runner, exit=False)
