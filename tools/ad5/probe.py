import sys
from gradio_client import Client
for s in sys.argv[1:]:
    print("=====", s, flush=True)
    try:
        Client(s, verbose=False).view_api(all_endpoints=False, print_info=True)
    except Exception as e:
        print("FAIL", s, repr(e)[:300], flush=True)
