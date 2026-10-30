// Interop C++ -> wspolna scena (WorldRegistry) przez <lab.h>.
// Odpal najpierw lua-ai (Chaser), STOP, potem ten plik.
#include <iostream>
#include <lab.h>
using namespace std;

int main() {
    int enemy = lab_spawn("EnemyCpp");
    cout << "[cpp] spawn -> obiekt " << enemy << endl;
    lab_attachRenderer(enemy, "slime", 48, 48);
    lab_setPosition(enemy, 100, 160);

    int chaser = lab_findComponent("Chaser");
    cout << "[cpp] findComponent(Chaser) = " << chaser << endl;
    if (chaser) {
        cout << "[cpp] Chaser.x = " << lab_getNum(chaser, "x") << endl;
        lab_setNum(chaser, "speed", 320);
        lab_call(chaser, "setTarget", "[64, 64]");
        cout << "[cpp] setNum speed=320 + setTarget(64,64) wyslane" << endl;
    }
    cout << "[cpp] koniec — obiekty zostaja na scenie" << endl;
    return 0;
}
