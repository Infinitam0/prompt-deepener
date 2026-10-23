# Deepen with a side model call, not a main-model turn

Deepening runs as a tool-less side completion over the session's transcript, not as a turn of the main model. A main turn would see more (tools, files) but writes the deepening into the transcript, costs a full turn, and risks the model starting the task. The side call keeps the chat clean and still knows the work through the transcript. Exception: in claude.ai threads, where the draft can't be filled, the `++` fallback has to be a main turn that replies and stops.
