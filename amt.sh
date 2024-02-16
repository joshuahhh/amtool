MYDIR="$(dirname "$(readlink -f "$0")")"

npx tsx $MYDIR/index.ts $@
