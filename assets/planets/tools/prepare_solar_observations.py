import argparse
import numpy as np


def prepare(source, output):
    with open(source, 'rb') as file:
        header = file.read(2880).decode('ascii')
        fields = {header[i:i + 8].strip(): header[i + 10:i + 80].split('/')[0].strip()
                  for i in range(0, 2880, 80) if header[i + 8:i + 10] == '= '}
        if (fields['BITPIX'], fields['NAXIS1'], fields['NAXIS2']) != ('-64', '3600', '1080'):
            raise ValueError('Expected the AIA CR2310 3600 × 1080 double-precision map')
        data = np.fromfile(file, dtype='>f8', count=3600 * 1080).reshape(1080, 3600).astype(float)
    rows = np.arange(1080)
    for column in data.T:
        valid = np.isfinite(column) & (column > 0)
        column[~valid] = np.interp(rows[~valid], rows[valid], column[valid])
    intensity = np.clip((np.log(data) - np.log(20)) / (np.log(700) - np.log(20)), 0, 1)
    intensity.astype('<f2').tofile(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    args = parser.parse_args()
    prepare(args.source, args.output)
