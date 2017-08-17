# pseudonet
A network modeling tool.

## Why
Wiring up physical gear is expensive and time consuming.

## How
[`systemd`](https://www.freedesktop.org/wiki/Software/systemd/), [`systemd-nspawn`](https://www.freedesktop.org/software/systemd/man/systemd-nspawn.html), [`machined`](https://www.freedesktop.org/wiki/Software/systemd/machined/), [`dbus`](https://www.freedesktop.org/wiki/Software/dbus/), [`iproute2`](https://wiki.linuxfoundation.org/networking/iproute2) and a bit of JavaScript.

## Install
``` shell
cd /opt
git clone https://github.com/jessetane/pseudonet
cd pseudonet
npm install
systemctl link /opt/pseudonet/container-engine/pn-machine@.service
cd /var/lib/machines
mkdir machine-template
pacstrap -i -c -d ./machine-template base
```

## Use
``` shell
node index.js &
cli/index.js networks.list
[]
cli/index.js networks.add
e13a
cli/index.js networks.list
[e13a]
cli/index.js machines.add e13a machine-template
a4f1
cli/index.js machines.add e13a machine-template
b34c
cli/index.js links.add a4f1 b34c
3c6e
```

## License
MIT
