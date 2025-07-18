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


class Test3ConvertErrors(ExamTestCase):
    """
    Each assignment has 1 testcase with multiple asserts.
    The different asserts https://docs.python.org/3.6/library/unittest.html#test-cases
    """

    # link_to_assignment = "https://dbwebb-python-bth.github.io/website/laromaterial/uppgift/convert/"

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
                with self.assertRaises(SystemExit):
                    import_module(REPO_PATH, "convert")
                return fake_out.getvalue()

    @tags("error", "value")
    def test_a_value_not_float(self):
        """
        Testar skicka in sträng värde som input. Kollar att felhantering sker.
        Använder följande som input:
        {arguments}
        Förväntar att följande finns med i utskrift:
        {correct}
        Fick följande:
        {student}
        """
        self.norepr = True
        self._argument = "inte float"
        output_from_program = self.get_output_from_program(self._argument)
        self.assertIn("Invalid value", output_from_program)

    @tags("error", "converter")
    def test_b_invalid_converter(self):
        """
        Testar skicka in felaktigt värde för att välja vad som ska konverteras. Kollar att felhantering sker.
        Använder följande som input:
        {arguments}
        Förväntar att följande finns med i utskrift:
        {correct}
        Fick följande:
        {student}
        """
        self.norepr = True
        self._argument = "inte float"
        output_from_program = self.get_output_from_program(self._argument)
        self.assertIn("Invalid value", output_from_program)


if __name__ == "__main__":
    runner = TextTestRunner(resultclass=ExamTestResult, verbosity=2)
    unittest.main(testRunner=runner, exit=False)
