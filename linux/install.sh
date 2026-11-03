#!/bin/sh
# Installs the rustSet server natively (no Docker) on Linux and runs it as a systemd service.
#
# Run it from the repository checkout, as root:
#
#   git clone https://github.com/gganeles/rustSet && cd rustSet
#   sudo sh linux/install.sh
#
# Works with apt (Debian, Ubuntu) and dnf/yum (Oracle Linux, RHEL, Rocky, Alma, Fedora),
# on x86-64 or ARM (such as Oracle Cloud's Ampere machines). It installs its own Rust
# toolchain if root has none, and a Python venv with spaCy for Anagrams.
#
# It is safe to run again: to update, `git pull` and rerun it.
#
# Settings, in the environment:
#   RUSTSET_PYTHON   the Python to build against and run spaCy with (default: python3.12
#                    on dnf systems, python3 on apt systems)
set -eu

LIB=/usr/local/lib/rustset
VENV=$LIB/venv
BIN=/usr/local/bin/rustset-server
CONFIG_DIR=/etc/rustset
UNIT=/etc/systemd/system/rustset.service

# sudo on Oracle Linux, RHEL and others resets PATH to a secure_path without /usr/local.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH
export PATH
umask 022

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Linux ] || die "this installer is for Linux."
[ "$(id -u)" -eq 0 ] || die "run it as root, e.g. sudo sh $0"
REPO=$(cd "$(dirname "$0")/.." && pwd)
[ -f "$REPO/server/Cargo.toml" ] || die "run it from the rustSet repository checkout."

# ---------------------------------------------------------------- packages

if command -v apt-get >/dev/null 2>&1; then PM=apt
elif command -v dnf >/dev/null 2>&1; then PM=dnf
elif command -v yum >/dev/null 2>&1; then PM=yum
else die "no apt, dnf or yum found; install Rust, a C compiler and Python 3.10-3.12 with headers yourself"
fi

case $PM in
apt) PYTHON=${RUSTSET_PYTHON:-python3} ;;
*) PYTHON=${RUSTSET_PYTHON:-python3.12} ;;
esac

say "Installing packages ($PM, $PYTHON)"
case $PM in
apt)
	DEBIAN_FRONTEND=noninteractive apt-get update -qq
	DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates gcc \
		"$PYTHON" "$PYTHON-dev" "$PYTHON-venv"
	;;
dnf | yum)
	# Oracle Linux 9's python3 is 3.9, too old for current spaCy; python3.12 is in AppStream.
	$PM install -y -q curl ca-certificates gcc "$PYTHON" "$PYTHON-devel"
	;;
esac
PYTHON=$(command -v "$PYTHON") || die "$PYTHON isn't installed"
echo "using $("$PYTHON" --version) at $PYTHON"

# ---------------------------------------------------------------- python venv with spaCy

# The server embeds the Python it was built against and reads spaCy from this venv, so a
# venv from a different Python version can't be reused.
want=$("$PYTHON" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
if [ -x "$VENV/bin/python" ]; then
	have=$("$VENV/bin/python" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true)
	if [ "$have" != "$want" ]; then
		echo "replacing the Python $have venv with a Python $want one"
		rm -rf "$VENV"
	fi
fi
if [ ! -x "$VENV/bin/python" ]; then
	say "Creating the Python venv in $VENV"
	mkdir -p "$LIB"
	"$PYTHON" -m venv "$VENV"
fi

say "Installing spaCy and en_core_web_sm"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q spacy
if "$VENV/bin/python" -c 'import en_core_web_sm' 2>/dev/null; then
	echo "en_core_web_sm already installed"
else
	"$VENV/bin/python" -m spacy download en_core_web_sm
fi

# ---------------------------------------------------------------- build

# Rust toolchain: root's own if it has one, otherwise our private copy in $LIB.
if command -v cargo >/dev/null 2>&1; then
	CARGO=$(command -v cargo)
else
	export RUSTUP_HOME=$LIB/rustup CARGO_HOME=$LIB/cargo
	if [ ! -x "$CARGO_HOME/bin/cargo" ]; then
		say "Installing Rust into $LIB"
		curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
			sh -s -- -y -q --no-modify-path --profile minimal --default-toolchain stable
	else
		"$CARGO_HOME/bin/rustup" -q update stable >/dev/null
	fi
	CARGO=$CARGO_HOME/bin/cargo
fi

say "Building the server with $("$CARGO" --version) (a few minutes the first time)"
# The target dir lives outside the checkout so root doesn't leave files in someone's clone.
PYO3_PYTHON=$PYTHON CARGO_TARGET_DIR=$LIB/target \
	"$CARGO" build --release --locked --manifest-path "$REPO/server/Cargo.toml"
install -m 755 "$LIB/target/release/rust_ws_server" "$BIN"
echo "installed $BIN"

# ---------------------------------------------------------------- service

mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/env" ]; then
	cat >"$CONFIG_DIR/env" <<'EOF'
# Settings for rustset.service; restart it after changing them:
#   sudo systemctl restart rustset
#
# Listen address. The default, 127.0.0.1:3030, suits a Cloudflare tunnel or a reverse
# proxy on this machine. Use 0.0.0.0:3030 to accept connections from other machines.
#RUSTSET_ADDR=127.0.0.1:3030
EOF
fi

if [ ! -d /run/systemd/system ]; then
	say "Done, but there's no systemd here, so no service was set up. Run it with:"
	echo "  VIRTUAL_ENV=$VENV $BIN"
	exit 0
fi

say "Starting rustset.service"
install -m 644 "$REPO/linux/rustset.service" "$UNIT"
systemctl daemon-reload
systemctl enable -q rustset
systemctl restart rustset
sleep 3
if systemctl is-active -q rustset; then
	journalctl -u rustset -n 5 --no-pager -o cat
	say "rustSet is running. Logs: journalctl -u rustset -f"
else
	journalctl -u rustset -n 20 --no-pager -o cat
	die "rustset.service didn't start; see the log above"
fi
