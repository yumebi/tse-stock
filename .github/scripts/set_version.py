# -*- coding: utf-8 -*-
"""バージョンを5箇所すべてに書き込む。

このアプリはバージョンが5ファイルに散っている。Cargo.lock にも自身の
バージョンが記録されているため、Cargo.toml だけ変えるとロックがずれる。

    python3 .github/scripts/set_version.py 1.2.4

CIから呼ばれるが、手元でも実行できる。ワークフローのYAMLに直接書くと
インデントの制約で壊れやすく、手元で検証もできないため切り出している。
"""
import io
import os
import re
import sys

# リポジトリのルート(このスクリプトから2つ上)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def replace(rel_path, pattern, repl):
    """1箇所だけ置換する。見つからなければ失敗させる。

    count=1 なのは、依存パッケージ側の version 指定を触らないため。
    どのファイルも自身のバージョンが先頭側に来る。
    """
    path = os.path.join(ROOT, rel_path)
    src = io.open(path, encoding='utf-8').read()
    out, n = re.subn(pattern, repl, src, count=1)
    if n == 0:
        raise SystemExit('置換できなかった: %s' % rel_path)
    if out == src:
        print('  変更なし %s' % rel_path)
        return
    io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
    print('  更新 %s' % rel_path)


def main():
    if len(sys.argv) != 2:
        raise SystemExit('使い方: set_version.py <バージョン>')
    version = sys.argv[1].strip().lstrip('v')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise SystemExit('バージョンの形式が不正: %r (例: 1.2.4)' % version)

    print('バージョンを %s にする' % version)

    json_ver = r'"version":\s*"[^"]+"'
    replace('package.json', json_ver, '"version": "%s"' % version)
    replace('version.json', json_ver, '"version": "%s"' % version)
    replace('src-tauri/tauri.conf.json', json_ver, '"version": "%s"' % version)
    replace('src-tauri/Cargo.toml', r'(?m)^version\s*=\s*"[^"]+"', 'version = "%s"' % version)

    # Cargo.lock は自身のパッケージ項目だけを狙う。
    # 依存クレートにも同じ形の version 行が並ぶため、name で位置を固定する。
    replace(
        'src-tauri/Cargo.lock',
        r'(name = "tse-stock"\nversion = )"[^"]+"',
        lambda m: m.group(1) + '"%s"' % version,
    )


if __name__ == '__main__':
    main()
