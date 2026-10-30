"""Verify installer policy without installing into Applications."""
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'packaging'))
from build_installer import InstallerSpec, NativeRequirements


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.spec = InstallerSpec(Path('/tmp/Perlin Atelier.app'), '1.1.1',
                                  '12.0', ('x86_64', 'arm64'))

    def test_installs_only_into_applications(self):
        self.assertEqual(self.spec.install_location, '/Applications')
        component, = self.spec.components()
        self.assertEqual(component['RootRelativeBundlePath'], 'Perlin Atelier.app')
        self.assertFalse(component['BundleIsRelocatable'])
        self.assertTrue(component['BundleIsVersionChecked'])
        self.assertTrue(component['BundleHasStrictIdentifier'])
        self.assertEqual(component['BundleOverwriteAction'], 'upgrade')

    def test_architecture_and_minimum_version_are_explicit(self):
        self.assertEqual(self.spec.requirements(),
                         {'arch': ['x86_64', 'arm64'], 'os': ['12.0']})
        self.assertEqual(self.spec.package_id,
                         'uk.gordonbrindle.perlinatelier.installer')

    def test_distribution_uses_system_domain_without_scripts(self):
        source = '<installer-gui-script><options/><pkg-ref id="app">atelier.pkg</pkg-ref></installer-gui-script>'
        root = ET.fromstring(self.spec.decorate_distribution(source))
        self.assertEqual(root.find('options').get('hostArchitectures'), 'x86_64,arm64')
        self.assertEqual(root.find('options').get('require-scripts'), 'false')
        self.assertEqual(root.find('domains').get('enable_currentUserHome'), 'false')
        self.assertEqual(root.find('title').text, 'Perlin Atelier 1.1.1')
        self.assertEqual(root.find('pkg-ref').text, 'atelier.pkg')

    def test_binary_minimum_os_is_read_from_load_commands(self):
        commands = 'cmd LC_BUILD_VERSION\ncmdsize 32\nplatform 1\nminos 12.0\nsdk 15.0'
        self.assertEqual(NativeRequirements.minimum_os(commands), '12.0')
        with self.assertRaises(ValueError):
            NativeRequirements.minimum_os('not a Mach-O load command')


if __name__ == '__main__':
    unittest.main()
