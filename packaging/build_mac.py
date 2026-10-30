"""Build the self-contained universal Mac app using Apple's system frameworks."""
from pathlib import Path
import plistlib
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.1.1'


class MacAppBuilder:
    """Compile and assemble a bundle under dist; never install it."""

    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.output = self.root / 'dist'
        self.app = self.output / 'Perlin Atelier.app'

    @staticmethod
    def run(arguments, **kwargs):
        return subprocess.run([str(arg) for arg in arguments], check=True,
                              **kwargs)

    def build(self):
        self.run(['node', self.root / 'build.js'])
        with tempfile.TemporaryDirectory(prefix='perlin-app-') as directory:
            stage = Path(directory)
            app = stage / self.app.name
            binary = app / 'Contents/MacOS/Perlin Atelier'
            resources = app / 'Contents/Resources'
            resources.mkdir(parents=True)
            binary.parent.mkdir(parents=True)
            self.run(['xcrun', 'clang', '-fobjc-arc', '-O2', '-arch', 'arm64',
                      '-arch', 'x86_64', '-mmacosx-version-min=12.0',
                      '-framework', 'Cocoa', '-framework', 'WebKit',
                      '-framework', 'ImageIO', '-framework', 'UniformTypeIdentifiers',
                      self.root / 'native/main.m', '-o', binary])
            shutil.copy2(self.output / 'Perlin_Atelier.html', resources)
            info = {
                'CFBundleIdentifier': 'uk.gordonbrindle.perlinatelier',
                'CFBundleName': 'Perlin Atelier',
                'CFBundleDisplayName': 'Perlin Atelier',
                'CFBundleExecutable': 'Perlin Atelier',
                'CFBundlePackageType': 'APPL',
                'CFBundleVersion': VERSION,
                'CFBundleShortVersionString': VERSION,
                'LSMinimumSystemVersion': '12.0',
                'LSApplicationCategoryType': 'public.app-category.graphics-design',
                'NSHighResolutionCapable': True,
                'CFBundleIconFile': 'AppIcon',
                'NSHumanReadableCopyright': '© 2026 Gordon Brindle',
            }
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
            self.icon(binary, resources, stage)
            self.run(['/usr/bin/codesign', '--force', '--sign', '-', app])
            self.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', app])
            self.run([binary, '--self-test'])
            if self.app.exists():
                shutil.rmtree(self.app)
            shutil.copytree(app, self.app)
        return self.app

    def icon(self, binary, resources, stage):
        original = stage / 'icon.png'
        self.run([binary, '--make-icon', original])
        iconset = stage / 'AppIcon.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                suffix = '@2x' if scale == 2 else ''
                target = iconset / f'icon_{size}x{size}{suffix}.png'
                self.run(['/usr/bin/sips', '-z', size * scale, size * scale,
                          original, '--out', target], stdout=subprocess.DEVNULL)
        # Modern ICNS stores PNG images in typed size records. Avoid iconutil's
        # dependency on a GUI image service when building in a restricted shell.
        records = []
        for code, name in (
            (b'icp4', 'icon_16x16.png'), (b'icp5', 'icon_32x32.png'),
            (b'ic07', 'icon_128x128.png'), (b'ic08', 'icon_256x256.png'),
            (b'ic09', 'icon_512x512.png'), (b'ic10', 'icon_512x512@2x.png'),
        ):
            png = (iconset / name).read_bytes()
            records.append(code + struct.pack('>I', len(png) + 8) + png)
        data = b''.join(records)
        (resources / 'AppIcon.icns').write_bytes(
            b'icns' + struct.pack('>I', len(data) + 8) + data)


if __name__ == '__main__':
    print(MacAppBuilder().build())
