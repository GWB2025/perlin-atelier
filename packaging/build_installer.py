"""Build and verify a macOS installer for an existing Perlin Atelier bundle."""

import argparse
from dataclasses import dataclass
import hashlib
from html import escape
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP_NAME = 'Perlin Atelier.app'
BUNDLE_ID = 'uk.gordonbrindle.perlinatelier'
EXECUTABLE = 'Contents/MacOS/Perlin Atelier'
MACH_MAGIC = {bytes.fromhex(value) for value in (
    'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
    'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca',
)}


def run(arguments, **kwargs):
    """Run an Apple packaging tool without using shell interpolation."""
    return subprocess.run([str(value) for value in arguments], check=True,
                          **kwargs)


@dataclass(frozen=True)
class NativeRequirements:
    """Requirements of the actual launcher and its bundled dependencies."""

    architectures: tuple[str, ...]
    minimum: str

    @staticmethod
    def minimum_os(load_commands):
        values = re.findall(
            r'cmd LC_BUILD_VERSION\s+cmdsize \d+\s+'
            r'platform \S+\s+minos ([\d.]+)'
            r'|cmd LC_BUILD_VERSION\s+platform \S+\s+minos ([\d.]+)'
            r'|cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version ([\d.]+)',
            load_commands,
        )
        if not values:
            raise ValueError('A native binary has no macOS deployment target.')
        return NativeRequirements.highest(
            value for group in values for value in group if value)

    @staticmethod
    def highest(versions):
        return max(versions, key=lambda value: tuple(
            int(part) for part in value.split('.')))

    @classmethod
    def inspect(cls, app):
        architectures = tuple(run(
            ['/usr/bin/lipo', '-archs', app / EXECUTABLE],
            capture_output=True, text=True).stdout.split())
        if not architectures or not set(architectures) <= {'arm64', 'x86_64'}:
            raise ValueError(
                'Only Apple silicon and Intel Mac builds are supported.')
        versions = []
        for binary in sorted(app.rglob('*')):
            if binary.is_symlink() or not binary.is_file():
                continue
            with binary.open('rb') as stream:
                if stream.read(4) not in MACH_MAGIC:
                    continue
            arches = run(['/usr/bin/lipo', '-archs', binary],
                         capture_output=True, text=True).stdout.split()
            if not set(architectures) <= set(arches):
                raise ValueError(
                    f'Incompatible bundled architecture: {binary}')
            commands = run(['/usr/bin/otool', '-l', binary],
                           capture_output=True, text=True).stdout
            versions.append(cls.minimum_os(commands))
        if not versions:
            raise ValueError('The app contains no native Mac binaries.')
        return cls(architectures, cls.highest(versions))


@dataclass(frozen=True)
class InstallerSpec:
    app: Path
    version: str
    minimum_os: str
    architectures: tuple[str, ...]
    install_location: str = '/Applications'
    package_id: str = BUNDLE_ID + '.installer'

    @classmethod
    def from_app(cls, app):
        app = Path(app).resolve()
        info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
        version = info.get('CFBundleVersion', '')
        minimum = info.get('LSMinimumSystemVersion')
        if (app.name != APP_NAME
                or info.get('CFBundleIdentifier') != BUNDLE_ID
                or info.get('CFBundleExecutable') != Path(EXECUTABLE).name
                or not (app / EXECUTABLE).is_file()
                or not re.fullmatch(r'\d+\.\d+\.\d+', version)
                or info.get('CFBundleShortVersionString') != version
                or (minimum is not None and not re.fullmatch(
                    r'\d+\.\d+(?:\.\d+)?', minimum))):
            raise ValueError(
                'Choose a complete Perlin Atelier app with consistent versions.')
        native = NativeRequirements.inspect(app)
        minimum = NativeRequirements.highest(
            [native.minimum] + ([minimum] if minimum else []))
        return cls(app, version, minimum, native.architectures)

    def components(self):
        return [{
            'RootRelativeBundlePath': APP_NAME,
            'BundleIsRelocatable': False,
            'BundleIsVersionChecked': True,
            'BundleHasStrictIdentifier': True,
            'BundleOverwriteAction': 'upgrade',
        }]

    def requirements(self):
        return {'arch': list(self.architectures), 'os': [self.minimum_os]}

    def decorate_distribution(self, source):
        root = ET.fromstring(source)
        for name in ('title', 'welcome', 'conclusion', 'domains'):
            for element in root.findall(name):
                root.remove(element)
        ET.SubElement(root, 'title').text = 'Perlin Atelier ' + self.version
        ET.SubElement(root, 'welcome', {'file': 'Welcome.html'})
        ET.SubElement(root, 'conclusion', {'file': 'Conclusion.html'})
        ET.SubElement(root, 'domains', {
            'enable_anywhere': 'false',
            'enable_currentUserHome': 'false',
            'enable_localSystem': 'true',
        })
        options = root.find('options')
        if options is None:
            options = ET.SubElement(root, 'options')
        options.set('customize', 'never')
        options.set('hostArchitectures', ','.join(self.architectures))
        options.set('require-scripts', 'false')
        return ET.tostring(root, encoding='unicode', xml_declaration=True)


class InstallerBuilder:
    """Package an unchanged app; never install it or access saved user data."""

    def __init__(self, spec):
        self.spec = spec

    @property
    def machine_label(self):
        return ' / '.join({'arm64': 'Apple silicon', 'x86_64': 'Intel'}[arch]
                          for arch in self.spec.architectures)

    @staticmethod
    def page(title, body):
        return ('<!doctype html><html lang="en-GB"><meta charset="utf-8">'
                '<style>body{font:14px -apple-system,Helvetica,sans-serif;'
                'line-height:1.5;padding:14px;color:#222}'
                'h1{font-size:24px;font-weight:500}li{margin:10px 0}'
                '</style><title>' + escape(title) + '</title><h1>'
                + escape(title) + '</h1>' + body + '</html>')

    def resources(self, destination):
        destination.mkdir()
        welcome = self.page('Perlin Atelier ' + self.spec.version,
            '<p>This installer places <strong>Perlin Atelier</strong> in '
            '<strong>Applications</strong>.</p>'
            '<p>Quit any older copy before continuing. Choose Continue, '
            'then Install. macOS may request an administrator password.</p>'
            '<p>Works offline on Apple silicon and Intel Macs with macOS '
            + escape(self.spec.minimum_os) + ' or later. '
            'No additional runtime downloads are needed.</p>')
        conclusion = self.page('Ready to create',
            '<p>Open <strong>Finder → Applications → Perlin Atelier</strong>.</p>'
            '<p>Choose Letter garden, enter your text and explore the five '
            'stages. SVG and PNG exports use the Mac Save dialogue.</p>'
            '<p>No restart is needed. The app generates artwork and does '
            'not connect to a plotter.</p>')
        (destination / 'Welcome.html').write_text(welcome, encoding='utf-8')
        (destination / 'Conclusion.html').write_text(conclusion, encoding='utf-8')

    def build(self, output):
        output = Path(output).resolve()
        if output.suffix != '.pkg' or output.is_relative_to(self.spec.app):
            raise ValueError('Choose a .pkg output path outside the app.')
        run(['/usr/bin/codesign', '--verify', '--deep', '--strict',
             self.spec.app])
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='perlin-installer-') as temp:
            stage = Path(temp)
            payload = stage / 'payload'
            payload.mkdir()
            shutil.copytree(self.spec.app, payload / APP_NAME, symlinks=True)
            components = stage / 'components.plist'
            components.write_bytes(plistlib.dumps(self.spec.components()))
            product = stage / 'requirements.plist'
            product.write_bytes(plistlib.dumps(self.spec.requirements()))
            component = stage / 'atelier.pkg'
            run(['/usr/bin/pkgbuild', '--root', payload,
                 '--component-plist', components, '--identifier',
                 self.spec.package_id, '--version', self.spec.version,
                 '--install-location', self.spec.install_location,
                 '--ownership', 'recommended', component])
            distribution = stage / 'Distribution.xml'
            run(['/usr/bin/productbuild', '--synthesize', '--product', product,
                 '--package', component, distribution])
            distribution.write_text(self.spec.decorate_distribution(
                distribution.read_text()), encoding='utf-8')
            resources = stage / 'Resources'
            self.resources(resources)
            run(['/usr/bin/productbuild', '--distribution', distribution,
                 '--resources', resources, '--package-path', stage, output])
        return output

    @staticmethod
    def contents(root):
        result = {}
        for path in sorted(root.rglob('*')):
            if path.is_symlink():
                value = 'link:' + os.readlink(path)
            elif path.is_file():
                value = hashlib.sha256(path.read_bytes()).hexdigest()
            else:
                continue
            result[str(path.relative_to(root))] = value
        return result

    @staticmethod
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def verify(self, package):
        """Expand and smoke-test the payload without installation or USB."""
        with tempfile.TemporaryDirectory(prefix='perlin-pkg-check-') as temp:
            expanded = Path(temp) / 'expanded'
            run(['/usr/sbin/pkgutil', '--expand-full', package, expanded])
            info = ET.parse(expanded / 'atelier.pkg/PackageInfo').getroot()
            for name, value in {
                'install-location': self.spec.install_location,
                'identifier': self.spec.package_id,
                'version': self.spec.version,
                'relocatable': 'false', 'auth': 'root',
            }.items():
                self.require(info.get(name) == value, f'Unexpected {name}.')
            self.require(info.find('scripts') is None,
                         'Unexpected install scripts.')
            self.require(info.find('bundle-version/bundle') is not None,
                         'Missing bundle version check.')
            for name in ('upgrade-bundle', 'strict-identifier'):
                bundle = info.find(name + '/bundle')
                self.require(bundle is not None
                             and bundle.get('id') == BUNDLE_ID,
                             'Unexpected bundle upgrade policy.')
            app = expanded / 'atelier.pkg/Payload' / APP_NAME
            manifest = self.contents(app)
            self.require(manifest == self.contents(self.spec.app),
                         'Packaged app differs from its source.')
            payload_names = {path.name for path in app.parent.iterdir()}
            self.require(payload_names == {APP_NAME},
                         'Unexpected files outside the app.')
            self.require(os.access(app / EXECUTABLE, os.X_OK),
                         'The packaged launcher is not executable.')
            distribution = ET.parse(expanded / 'Distribution').getroot()
            self.require(distribution.find('domains').attrib == {
                'enable_anywhere': 'false', 'enable_currentUserHome': 'false',
                'enable_localSystem': 'true',
            }, 'Unexpected installation domains.')
            self.require(distribution.find('options').get('hostArchitectures')
                         == ','.join(self.spec.architectures),
                         'Unexpected architecture requirement.')
            minimum = distribution.find('.//os-version').get('min')
            self.require(minimum == self.spec.minimum_os,
                         'Unexpected macOS requirement.')
            run(['/usr/bin/codesign', '--verify', '--deep', '--strict', app])
            run([app / EXECUTABLE, '--self-test'])
            return {
                'version': self.spec.version,
                'destination': self.spec.install_location + '/' + APP_NAME,
                'architectures': list(self.spec.architectures),
                'minimum_macos': self.spec.minimum_os,
                'payload_files': len(manifest),
                'payload_matches_app': True,
                'signature_check': 'passed (ad-hoc or Developer ID)',
                'packaged_smoke_test': 'passed',
                'installation_performed': False,
                'physical_plotter_tested': False,
                'sha256': hashlib.sha256(
                    Path(package).read_bytes()).hexdigest(),
            }


    def archive(self, package, validation):
        archive = package.with_suffix('.zip')
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
            output.write(package, package.name)
            output.write(ROOT / 'packaging/READ-ME-FIRST.txt', 'READ-ME-FIRST.txt')
            output.writestr('VALIDATION.json', json.dumps(validation, indent=2) + '\n')
        with zipfile.ZipFile(archive) as checked:
            self.require(checked.testzip() is None, 'Corrupt installer archive.')
            self.require(checked.read(package.name) == package.read_bytes(),
                         'Archived package differs from the build.')
        return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    builder = InstallerBuilder(InstallerSpec.from_app(args.app))
    package = builder.build(args.output)
    validation = builder.verify(package)
    (package.parent / 'VALIDATION.json').write_text(json.dumps(validation, indent=2) + '\n')
    print(builder.archive(package, validation))
    print(json.dumps(validation, indent=2))


if __name__ == '__main__':
    main()
