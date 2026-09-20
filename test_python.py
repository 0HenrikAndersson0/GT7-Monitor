from salsa20 import Salsa20_xor
key = b'Simulator Interface Packet GT7 v'
nonce = bytes([1,2,3,4,5,6,7,8])
data = bytes([10,20,30,40,50])
print(list(Salsa20_xor(data, nonce, key)))
