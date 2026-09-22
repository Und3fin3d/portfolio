import argparse
import numpy as np
from PIL import Image


def reference_palette(reference):
    image = np.asarray(Image.open(reference).convert('RGB'), dtype=float)
    y, x = np.indices(image.shape[:2])
    radius = image.shape[0] * 0.398
    disc = (x - image.shape[1] * 0.5) ** 2 + (y - image.shape[0] * 0.486) ** 2 < (radius * 0.96) ** 2
    pixels = image[disc]
    intensity = pixels @ [0.2126, 0.7152, 0.0722]
    ordered = pixels[np.argsort(intensity)]
    palette = np.array([np.mean(part, axis=0) for part in np.array_split(ordered, 256)])
    return np.clip(palette * [1.08, 0.72, 0.38], 0, 255)


def prepare(source, reference, output):
    source_image = Image.open(source).convert('RGB').resize((4096, 2048), Image.Resampling.LANCZOS)
    image = np.asarray(source_image, dtype=float)
    intensity = image @ [0.2126, 0.7152, 0.0722]
    quantiles = np.quantile(intensity, np.linspace(0, 1, 256))
    rank = np.interp(intensity, quantiles, np.arange(256))
    palette = reference_palette(reference)
    colour = np.stack([np.interp(rank, np.arange(256), palette[:, c]) for c in range(3)], axis=-1)
    Image.fromarray(colour.astype(np.uint8)).save(output, quality=95, optimize=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('reference')
    parser.add_argument('output')
    args = parser.parse_args()
    prepare(args.source, args.reference, args.output)
