// Konsola C++ (JSCPP — podzbiór edukacyjny; docelowo clang->WASM).
#include <iostream>
using namespace std;

int main() {
    cout << "Witaj z C++!" << endl;
    int suma = 0;
    for (int i = 1; i <= 10; i++) suma += i;
    cout << "Suma 1..10 = " << suma << endl;

    int a = 5;
    int *wsk = &a;
    *wsk = 7;
    cout << "wskaznik: a = " << a << endl;
    return 0;
}
